// ============================================================
// scripts/smoke-ai.mjs —— AI 模块冒烟测试（不依赖 Next 服务）
// 用法（web/ 目录）：
//   NODE_OPTIONS= node scripts/smoke-ai.mjs                # 全链路
//   NODE_OPTIONS= node scripts/smoke-ai.mjs explain 1422    # 只测单词讲解
// 会真实调用一次 DeepSeek API（消耗极小），并校验 JSON 结构。
// 注意：AI 结果有 30 天缓存，同词第二次跑走缓存逻辑（服务内）。
// ============================================================
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 手工加载 .env.local（不引依赖）
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const env = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {
  /* .env.local 不存在 */
}

const which = process.argv[2] || "all";
const arg = Number(process.argv[3]) || 1422;

function assert(cond, msg) {
  if (!cond) {
    console.error("✗ FAIL:", msg);
    process.exit(1);
  }
}

console.log("AI 配置:", process.env.LLM_API_KEY ? "有 key ✅" : "无 key ⛔", "| model:", process.env.LLM_MODEL || "deepseek-chat");

const { aiConfigured } = await import("../lib/ai.js");
if (!aiConfigured()) {
  console.error("未配置 LLM_API_KEY，请在 web/.env.local 填写后重试");
  process.exit(1);
}

const { wordById, searchWord } = await import("../lib/kb.js");
const { explainMessages, contrastMessages } = await import("../lib/prompts.js");

async function testExplain(id) {
  const entry = wordById(id);
  assert(entry, `词条 ${id} 不存在`);
  const ctx = searchWord(entry);
  const msgs = explainMessages(ctx);
  assert(msgs.length === 2 && msgs[0].role === "system", "explainMessages 结构");
  console.log(`\n[explain] ${entry.word_en}（${entry.definition_zh}）上下文: 同根 ${ctx.sameRoot.length} · 关联 ${ctx.sameUnit.length} · 易混 ${ctx.confusables.length}`);

  const { chatRobust } = await import("../lib/ai.js");
  const data = await chatRobust(msgs, { json: true, maxTokens: 900, timeoutMs: 60000 });
  assert(typeof data.explain === "string" && data.explain.length > 10, "explain 非空");
  assert(Array.isArray(data.examples), "examples 数组");
  assert(!data.examples[0] || data.examples[0].en, "example en 字段");
  console.log("✓ explain:", data.explain.slice(0, 60) + "…");
  console.log("✓ examples:", data.examples.length, "| confusable:", (data.confusable || []).length);
  return data;
}

async function testContrast() {
  const a = wordById(1422); // destroy
  const b = wordById(1425); // soil
  assert(a && b, "对比词存在");
  const msgs = contrastMessages(a.word_en, b.word_en, `${a.word_en}「${a.definition_zh}」`, `${b.word_en}「${b.definition_zh}」`);
  const { chatRobust } = await import("../lib/ai.js");
  const data = await chatRobust(msgs, { json: true, maxTokens: 700, timeoutMs: 60000 });
  assert(typeof data.why === "string" && data.why.length > 5, "why 非空");
  console.log("\n[contrast] " + a.word_en + " vs " + b.word_en);
  console.log("✓ why:", data.why.slice(0, 80) + "…");
  console.log("✓ wrong_point:", (data.wrong_point || "").slice(0, 60) + "…");
}

async function testPractice() {
  const { practiceMessages } = await import("../lib/prompts.js");
  const picks = [wordById(1422), wordById(1426), wordById(1430)];
  const pool = [wordById(1411), wordById(1412), wordById(1431), wordById(1436)];
  const msgs = practiceMessages(picks, pool, "9年级下册 Unit 3");
  const { chatRobust } = await import("../lib/ai.js");
  const data = await chatRobust(msgs, { json: true, maxTokens: 1800, timeoutMs: 90000 });
  assert(Array.isArray(data.questions) && data.questions.length > 0, "questions 数组");
  const first = data.questions[0];
  assert(first.type && first.q && first.answer, "question 字段完整");
  console.log("\n[practice] 生成", data.questions.length, "题");
  console.log("✓ 第1题 [" + first.type + "]", first.q.slice(0, 50) + "… →", first.answer);
}

if (which === "explain") await testExplain(arg);
else if (which === "contrast") await testContrast();
else if (which === "practice") await testPractice();
else {
  await testExplain(arg);
  await testPractice();
}
console.log("\n全部通过 ✅（你的 API key 与 AI 链路正常）");