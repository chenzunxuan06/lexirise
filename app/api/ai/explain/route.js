// POST /api/ai/explain —— F1 单词讲解（词库弹窗/生词本/错题卡复用）
// 输入: { id } 词库词 id（1..1535）
// 输出: { data: { explain, memory_tip, examples, confusable } }
// 缓存: explain:<id>（全局共享 30 天）
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { aiConfigured, chatRobust } from "@/lib/ai";
import { aiCacheGet, aiCacheSet } from "@/lib/ai-cache";
import { aiConsume, LimitError } from "@/lib/limits";
import { wordById, searchWord } from "@/lib/kb";
import { explainMessages } from "@/lib/prompts";

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
  const id = Number(body.id);
  const entry = wordById(id);
  if (!entry) {
    return NextResponse.json({ error: "词条不存在" }, { status: 404 });
  }

  const cacheKey = `explain:v2:${id}`;
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

  const ctx = searchWord(entry);
  try {
    const data = await chatRobust(explainMessages(ctx), {
      json: true,
      maxTokens: 900,
      temperature: 0.6,
      timeoutMs: 45000,
    });
    // 规范化输出
    const clean = {
      explain: String(data.explain || "").trim(),
      memory_tip: data.memory_tip || null,
      examples: Array.isArray(data.examples)
        ? data.examples.slice(0, 3).map((e) => ({
            en: String(e.en || "").trim(),
            zh: String(e.zh || "").trim(),
          }))
        : [],
      confusable: Array.isArray(data.confusable)
        ? data.confusable.slice(0, 3).map((c) => ({
            word: String(c.word || "").trim(),
            note: String(c.note || "").trim(),
          }))
        : [],
    };
    if (!clean.explain) {
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