// ============================================================
// scripts/pregen-ai.mjs —— AI 讲解离线批量预生成（自包含，Node 18/20/22 通用）
// ------------------------------------------------------------
// 目的：把 1535 词的「AI 单词讲解」一次性预生成到 ai_cache 表，
//       之后线上用户请求 /api/ai/explain 直接命中缓存，运行时零 API 调用，
//       彻底省下 DeepSeek 按次消耗的额度。
// 用法（在 web/ 目录下执行）：
//   node scripts/pregen-ai.mjs --dry-run              # 估算要生成多少词/约多少费用
//   node scripts/pregen-ai.mjs --limit 50             # 先试跑 50 个（验证链路）
//   node scripts/pregen-ai.mjs                        # 全量生成（断点续传，已缓存的自动跳过）
//   node scripts/pregen-ai.mjs --force                # 强制重新生成（覆盖已有缓存）
//   node scripts/pregen-ai.mjs --only-grade 8         # 只生成某年级
// 环境变量（web/.env.local 或临时 export）：
//   LLM_BASE_URL  LLM_API_KEY  LLM_MODEL
// 说明：脚本不 import lib/*（那些是 ESM 且包未设 type:module），
//       故独立实现 LLM 客户端 + 知识库上下文 + 缓存写入（复用 _backup.mjs 的 openDriver）。
// ============================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openDriver } from "./_backup.mjs";

const BASE_URL = (process.env.LLM_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const API_KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "deepseek-chat";

// ---------- 解析 CLI 参数 ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const optVal = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DRY = flag("--dry-run");
const FORCE = flag("--force");
const LIMIT = Number(optVal("--limit") || 0);
const ONLY_GRADE = Number(optVal("--only-grade") || 0);
const CONCURRENCY = Number(optVal("--concurrency") || 4);

// ---------- 易混词表（与 lib/builtin-kb.js 保持一致，自包含副本） ----------
const CONFUSABLES = [
  { a: "result in", b: "as a result of", note: "result in 是动词短语\"导致\"；as a result of 是介词短语\"由于\"，后接名词" },
  { a: "guard", b: "guide", note: "guard 守卫、卫兵、防范（guard against 提防）；guide 向导、指引" },
  { a: "spend", b: "cost", note: "spend 主语是人；cost 主语是物" },
  { a: "pay", b: "take", note: "pay 人付款（pay for）；take 常用 it takes sb ... to do（花费时间）" },
  { a: "borrow", b: "lend", note: "borrow 借入（borrow ... from）；lend 借出（lend ... to）" },
  { a: "bring", b: "take", note: "bring 带来（朝说话者方向）；take 带走（远离说话者方向）" },
  { a: "hear", b: "listen", note: "hear 听见（结果）；listen 听（动作，listen to）" },
  { a: "see", b: "look", note: "see 看见（结果）；look 看（动作，look at）" },
  { a: "say", b: "speak", note: "say 说内容；speak 说语言/发言" },
  { a: "arrive", b: "reach", note: "arrive 不及物（arrive in/at）；reach 及物" },
  { a: "join", b: "take part in", note: "join 加入组织；take part in 参加活动" },
  { a: "look for", b: "find", note: "look for 寻找（过程）；find 找到（结果）" },
  { a: "receive", b: "accept", note: "receive 收到（客观）；accept 接受（主观）" },
  { a: "raise", b: "rise", note: "raise 及物（举起/筹集）；rise 不及物（上升）" },
  { a: "win", b: "beat", note: "win 赢（比赛）；beat 打败（对手）" },
  { a: "used to do", b: "be used to doing", note: "used to do 过去常常；be used to doing 习惯于" },
  { a: "a few", b: "few", note: "a few 少数几个（肯定）；few 几乎没有（否定）" },
  { a: "a little", b: "little", note: "a little 一点儿（肯定）；little 几乎没有（否定）" },
  { a: "another", b: "other", note: "another 另一个（三者以上）；other 其他的（后接复数）" },
  { a: "between", b: "among", note: "between 两者之间；among 三者及以上之中" },
  { a: "dress", b: "wear", note: "dress 给穿衣；wear 穿着（状态）" },
  { a: "put on", b: "wear", note: "put on 穿上（动作）；wear 穿着（状态）" },
  { a: "except", b: "besides", note: "except 除...之外（排除）；besides 除...之外还（包含）" },
  { a: "interesting", b: "interested", note: "interesting 令人感兴趣；interested 感到有兴趣" },
  { a: "exciting", b: "excited", note: "exciting 令人兴奋；excited 感到兴奋" },
  { a: "already", b: "yet", note: "already 已经（肯定句）；yet 还（疑问/否定）" },
  { a: "have been to", b: "have gone to", note: "have been to 去过（已回来）；have gone to 去了（未回来）" },
  { a: "stop to do", b: "stop doing", note: "stop to do 停下来去做另一件事；stop doing 停止正在做的事" },
  { a: "remember to do", b: "remember doing", note: "remember to do 记得去做；remember doing 记得做过" },
  { a: "problem", b: "question", note: "problem 难题（solve）；question 问题（answer）" },
  { a: "work", b: "job", note: "work 工作（不可数）；job 职业（可数）" },
  { a: "so", b: "such", note: "so + 形容词/副词；such + 名词短语" },
  { a: "too", b: "very", note: "too 太（超出程度）；very 很（程度加强）" },
];

function confusablesFor(wordEn) {
  const w = String(wordEn || "").trim().toLowerCase();
  return CONFUSABLES.filter((c) => c.a.toLowerCase() === w || c.b.toLowerCase() === w);
}

// ---------- 词库加载 ----------
const WORDS = JSON.parse(readFileSync(join(process.cwd(), "public", "words.json"), "utf8"));
const allWords = WORDS.words || [];
const byUnit = new Map();
for (const w of allWords) {
  const uk = `${w.grade ?? 0}-${w.semester ?? 0}-${w.unit ?? 0}`;
  if (!byUnit.has(uk)) byUnit.set(uk, []);
  byUnit.get(uk).push(w);
}

// ---------- LLM 客户端（与 lib/ai.js 同逻辑） ----------
function stripFence(t) {
  let s = String(t || "").trim();
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) s = m[1].trim();
  return s;
}
function parseJson(text) {
  const t = stripFence(text);
  try { return JSON.parse(t); } catch { /* retry below */ }
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; } }
  return null;
}
async function chat(messages) {
  const body = { model: MODEL, messages, temperature: 0.6, max_tokens: 900, response_format: { type: "json_object" } };
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(`LLM ${res.status} ${(d.error && d.error.message) || ""}`);
  }
  const data = await res.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  const parsed = parseJson(text);
  if (parsed === null) throw new Error("JSON 解析失败");
  return parsed;
}

// ---------- prompt（与 lib/prompts.js explainMessages 一致） ----------
const SYS_CORE =
  "你是「词跃」——初中英语词汇学习网站的 AI 讲解员。学生是初中生（沪教牛津版教材）。" +
  "规则：1) 只能依据下方提供的知识库内容作答，资料里没有的信息直接说'知识库里没有'，绝不编造词义、例句或考点；" +
  "2) 语言用简体中文，表达通俗、简短、适合初中生；3) 只输出一个 JSON 对象；" +
  "4) 凡是生成英文例句，必须非常简单：只使用初中最基础的词汇，句子不超过 8~10 个词，绝不用生僻词或复杂从句；每条英文例句都要给中文翻译。";

function buildMessages(entry, sameUnit, confusables) {
  const entryLine =
    `词条：${entry.word_en}${entry.phonetic ? " 音标 " + entry.phonetic : ""}${entry.pos ? " 词性 " + entry.pos : ""} 释义「${entry.definition_zh || ""}」` +
    (entry.affix_hint ? ` 词根词缀「${entry.affix_hint}」` : "") +
    (entry.example_en ? ` 例句「${entry.example_en}」（中文：${entry.example_zh || ""}）` : "") +
    `（来自 ${entry.grade || "?"}年级${entry.semester === 1 ? "上" : entry.semester === 2 ? "下" : "?"}册 Unit ${entry.unit ?? "?"}）`;
  const kb = [
    "【知识库-本词】" + entryLine,
    "【知识库-关联词（同单元/近形）】" + (sameUnit.length ? sameUnit.map((w) => ` ${w.word_en}「${w.definition_zh}」`).join("；") : " 无"),
    "【知识库-易混词】" + (confusables.length ? confusables.map((c) => ` ${c.a} / ${c.b}：${c.note}`).join("；") : " 无"),
  ].join("\n");
  return [
    { role: "system", content: SYS_CORE },
    {
      role: "user",
      content:
        kb +
        `\n\n请输出关于「${entry.word_en}」的讲解 JSON：\n` +
        '{"explain": "一句话通俗讲解（40~80字）", "memory_tip": "记忆方法（30~60字；没有可靠依据就填 null）", ' +
        '"examples": [{"en": "课本难度的英文例句（≤10词）", "zh": "中文翻译"}], ' +
        '"confusable": [{"word": "易混词", "note": "一句话说清区别（没有则空数组）"}]}',
    },
  ];
}

function normalize(entry, data) {
  return {
    explain: String(data.explain || "").trim(),
    memory_tip: data.memory_tip || null,
    examples: Array.isArray(data.examples)
      ? data.examples.slice(0, 3).map((e) => ({ en: String(e.en || "").trim(), zh: String(e.zh || "").trim() }))
      : [],
    confusable: Array.isArray(data.confusable)
      ? data.confusable.slice(0, 3).map((c) => ({ word: String(c.word || "").trim(), note: String(c.note || "").trim() }))
      : [],
  };
}

// ---------- 目标词筛选 ----------
let targets = allWords.filter((w) => w.word_en && w.entry_type !== "phrase");
if (ONLY_GRADE) targets = targets.filter((w) => w.grade === ONLY_GRADE);
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

const cacheKey = (id) => `explain:v2:${id}`;

// ---------- 主流程 ----------
if (!API_KEY) {
  console.error("❌ 未设置 LLM_API_KEY。请先在 web/.env.local 或临时 export LLM_API_KEY / LLM_MODEL。");
  process.exit(1);
}

const opened = await openDriver(join(process.cwd(), "data"));
if (!opened) {
  console.error("❌ 本地 SQLite 驱动不可用：请使用 Node >= 22.5，或安装 better-sqlite3。");
  process.exit(1);
}
const { db } = opened;
db.exec("CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL)");

const cachedKeys = new Set(db.prepare("SELECT key FROM ai_cache").all().map((r) => r.key));
const todo = FORCE ? targets : targets.filter((w) => !cachedKeys.has(cacheKey(w.id)));

console.log(`词库共 ${allWords.length} 词，待生成讲解 ${targets.length} 词，其中已缓存跳过 ${targets.length - todo.length} 词，实际要生成 ${todo.length} 词。`);
console.log(`估算费用：约 ${(todo.length * 1.6).toFixed(0)}K tokens，DeepSeek 约 ¥${(todo.length * 0.004).toFixed(2)}。`);

if (DRY) {
  console.log("--dry-run 模式：不实际调用。");
  db.close();
  process.exit(0);
}

let done = 0;
let failed = 0;
const failList = [];
let idx = 0;

async function worker() {
  while (idx < todo.length) {
    const entry = todo[idx++];
    try {
      const sameUnit = (byUnit.get(`${entry.grade ?? 0}-${entry.semester ?? 0}-${entry.unit ?? 0}`) || [])
        .filter((w) => w.id !== entry.id)
        .slice(0, 8);
      const confusables = confusablesFor(entry.word_en);
      const data = await chat(buildMessages(entry, sameUnit, confusables));
      const clean = normalize(entry, data);
      if (!clean.explain) throw new Error("explain 为空");
      db.prepare(
        "INSERT INTO ai_cache (key, result, created_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET result = excluded.result, created_at = excluded.created_at"
      ).run(cacheKey(entry.id), JSON.stringify(clean), Date.now());
      done++;
      process.stdout.write(`\r  [${done}/${todo.length}] ${entry.word_en} 完成   `);
    } catch (e) {
      failed++;
      failList.push(`${entry.id} ${entry.word_en}: ${e.message}`);
      process.stdout.write(`\r  [${done}/${todo.length}] ${entry.word_en} 失败   `);
    }
  }
}

const pool = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, () => worker());
await Promise.all(pool);

console.log(`\n\n✅ 预生成完成：成功 ${done}，失败 ${failed}。`);
if (failList.length) {
  console.log("失败词条（可重跑，脚本自动跳过已成功的）：");
  failList.forEach((f) => console.log("  - " + f));
}
db.close();
