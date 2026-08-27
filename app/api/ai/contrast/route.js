// POST /api/ai/contrast —— F3 错题对比讲解（为什么是这个、不是那个）
// 输入: { ids: [正确词id, 选错词id] }（id 可为负数：我的词表）
// 输出: { data: { why, wrong_point, tip } }
// 缓存: contrast:<a>|<b>（小写 id 排序规范化，全局共享）
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { aiConfigured, chatRobust } from "@/lib/ai";
import { aiCacheGet, aiCacheSet } from "@/lib/ai-cache";
import { aiConsume, LimitError } from "@/lib/limits";
import { wordById, searchWord } from "@/lib/kb";
import { contrastMessages, ENTRY_LINES } from "@/lib/prompts";

export async function POST(req) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI 服务未配置" }, { status: 501 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
  if (ids.length !== 2) {
    return NextResponse.json({ error: "需要两个词 id" }, { status: 400 });
  }
  // 规范化缓存键：按 id 排序（对比与顺序无关）
  const [a, b] = [...ids].sort((x, y) => x - y);
  const cacheKey = `contrast:${a}|${b}`;
  const cached = await aiCacheGet(cacheKey);
  if (cached) return NextResponse.json({ data: cached, cached: true });

  const user = await getUserFromRequest(req);
  try {
    await aiConsume(user ? user.id : 0, 1);
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  const ea = wordById(a);
  const eb = wordById(b);
  if (!ea || !eb) {
    return NextResponse.json({ error: "词条不存在" }, { status: 404 });
  }
  // 正确答案约定：输入顺序第一个为正确词（大写的展示用原顺序）
  const [correctId, wrongId] = ids;
  const correct = wordById(correctId);
  const wrong = wordById(wrongId);

  try {
    const infoCorrect = [ENTRY_LINES(correct)].concat(
      searchWord(correct).confusables.map((c) => `易混：${c.a} / ${c.b}：${c.note}`)
    ).join("\n");
    const infoWrong = ENTRY_LINES(wrong);
    const data = await chatRobust(contrastMessages(correct.word_en, wrong.word_en, infoCorrect, infoWrong), {
      json: true,
      maxTokens: 700,
      temperature: 0.5,
      timeoutMs: 45000,
    });
    const clean = {
      why: String(data.why || "").trim(),
      wrong_point: String(data.wrong_point || "").trim(),
      tip: data.tip || null,
      correct_word: correct.word_en,
      wrong_word: wrong.word_en,
    };
    if (!clean.why) {
      return NextResponse.json({ error: "AI 返回内容为空，请重试" }, { status: 502 });
    }
    await aiCacheSet(cacheKey, clean, 30);
    return NextResponse.json({ data: clean });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "AI 服务暂时不可用" },
      { status: e.status || 503 }
    );
  }
}