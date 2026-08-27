// POST /api/ai/practice —— F4 每日个性化练习
// 输入: { count=10, source:'auto'|'unit', grade?, semester?, unit? }
// 选词: auto=登录用户读 user_data.memory（到期词）+ wrong（高频错词），
//       不足由词库随机补足；游客/unit 模式按单元或全库随机。
// 输出: { questions: [{wordId, word, definition_zh, type, q, options?, answer, explain}] }
// 缓存: 按 用户+日期（auto）/ 用户+单元+日期（unit）
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiConfigured, chatRobust } from "@/lib/ai";
import { aiCacheGet, aiCacheSet } from "@/lib/ai-cache";
import { aiConsume, LimitError } from "@/lib/limits";
import { bank, wordById, unitWords } from "@/lib/kb";
import { practiceMessages } from "@/lib/prompts";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 服务端从该用户学习数据选词（到期优先，错题其次），不足随机补 */
function pickPersonal(db, memRaw, wrongRaw, count) {
  const now = Date.now();
  let mem = {};
  let wrong = {};
  try {
    mem = JSON.parse(memRaw || "{}");
  } catch {
    /* ignore */
  }
  try {
    wrong = JSON.parse(wrongRaw || "{}");
  } catch {
    /* ignore */
  }
  const due = Object.entries(mem)
    .filter(([, s]) => s && s.lv > 0 && s.due <= now)
    .sort((a, b) => (a[1].due || 0) - (b[1].due || 0))
    .map(([id]) => Number(id));
  const weak = Object.entries(wrong)
    .sort((a, b) => (b[1] && b[1].n || 0) - (a[1] && a[1].n || 0))
    .map(([id]) => Number(id));
  const picked = [];
  const seen = new Set();
  const take = (ids) => {
    for (const id of ids) {
      if (picked.length >= count) break;
      if (seen.has(id)) continue;
      const w = wordById(id);
      if (!w || w.entry_type === "phrase") continue;
      seen.add(id);
      picked.push(w);
    }
  };
  take(due);
  take(weak);
  return picked;
}

export async function POST(req) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI 服务未配置" }, { status: 501 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const count = Math.max(5, Math.min(20, Number(body.count) || 10));
  const source = body.source === "unit" ? "unit" : "auto";
  const grade = Number(body.grade);
  const semester = Number(body.semester);
  const unit = Number(body.unit);
  const useUnit = source === "unit" && grade && semester && unit;

  const user = await getUserFromRequest(req);
  const uid = user ? user.id : 0;
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = useUnit
    ? `practice:${uid}:${grade}-${semester}-${unit}:${today}`
    : `practice:${uid}:auto:${today}`;
  const cached = await aiCacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ questions: cached, cached: true });
  }

  try {
    await aiConsume(user ? user.id : 0, 1);
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  // ---- 选词 ----
  let picked = [];
  let fallbackPool = [];
  let unitLabelText = "";
  if (useUnit) {
    const ws = unitWords(grade, semester, unit).filter((w) => w.entry_type !== "phrase");
    picked = shuffle(ws).slice(0, count);
    fallbackPool = shuffle(ws.filter((w) => !picked.includes(w)));
    unitLabelText = `${grade}年级${semester === 1 ? "上" : "下"}册 Unit ${unit}`;
  } else if (user) {
    const db = await getDb();
    const row = await db.prepare("SELECT memory, wrong FROM user_data WHERE user_id = ?").get(user.id);
    picked = pickPersonal(user.id, row ? row.memory : null, row ? row.wrong : null, count);
  }
  if (picked.length < count) {
    const all = bank().words.filter((w) => w.entry_type !== "phrase");
    const seen = new Set(picked.map((w) => w.id));
    for (const w of shuffle(all)) {
      if (picked.length >= count) break;
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      picked.push(w);
    }
  }

  // ---- 干扰词池：答案词所在单元 + 随机词 ----
  const poolSet = new Set();
  const pool = [];
  for (const w of picked) {
    const k = `${w.grade ?? 0}-${w.semester ?? 0}-${w.unit ?? 0}`;
    for (const u of (bank().byUnit.get(k) || [])) {
      if (u.entry_type === "phrase" || poolSet.has(u.id)) continue;
      if (picked.some((p) => p.id === u.id)) continue;
      poolSet.add(u.id);
      pool.push(u);
    }
  }
  const allW = bank().words.filter((x) => x.entry_type !== "phrase");
  for (const w of shuffle(allW)) {
    if (pool.length >= 24) break;
    if (poolSet.has(w.id) || picked.some((p) => p.id === w.id)) continue;
    poolSet.add(w.id);
    pool.push(w);
  }

  // ---- 生成 ----
  try {
    const data = await chatRobust(
      practiceMessages(picked, pool.slice(0, 24), unitLabelText),
      { json: true, maxTokens: 2600, temperature: 0.6, timeoutMs: 90000 }
    );
    const raw = Array.isArray(data.questions) ? data.questions : [];
    const questions = [];
    const types = new Set(["fill", "recall", "transform"]);
    for (let i = 0; i < raw.length && i < picked.length; i++) {
      const q = raw[i];
      const w = picked[i];
      const type = types.has(q.type) ? q.type : "recall";
      questions.push({
        wordId: w.id,
        word: w.word_en,
        definition_zh: w.definition_zh,
        type,
        q: String(q.q || "").trim(),
        options:
          type === "fill" && Array.isArray(q.options) && q.options.length >= 2
            ? q.options.slice(0, 4).map((o) => String(o).trim()).filter(Boolean)
            : null,
        answer: String(q.answer || "").trim().toLowerCase(),
        explain: String(q.explain || "").trim(),
      });
    }
    if (!questions.length) {
      return NextResponse.json({ error: "AI 返回内容为空，请重试" }, { status: 502 });
    }
    await aiCacheSet(cacheKey, questions, 1);
    return NextResponse.json({ questions, cached: false });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "AI 服务暂时不可用" },
      { status: e.status || 503 }
    );
  }
}