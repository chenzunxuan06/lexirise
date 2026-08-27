// POST /api/ai/enrich-words —— F2 我的词表 AI 补全（需登录）
// 输入: {}（自动取该用户待补全的词，每次最多 20 个，每日 2 次额度）
// 输出: { enriched, pending, results: [...] }
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { aiConfigured, chatRobust } from "@/lib/ai";
import { aiConsume, LimitError, aiUsedToday } from "@/lib/limits";
import { enrichMessages } from "@/lib/prompts";

const BATCH = 20;
const DAILY_BATCHES = 2;

export async function POST(req) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: "AI 服务未配置" }, { status: 501 });
  }
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const db = await getDb();
  const pending = await db
    .prepare(
      `SELECT cw.id, cw.word_en, cw.phonetic, cw.pos, cw.definition_zh
       FROM custom_words cw
       LEFT JOIN custom_word_ai cwa ON cwa.word_id = cw.id
       WHERE cw.user_id = ? AND cwa.word_id IS NULL
       ORDER BY cw.id ASC LIMIT ${BATCH}`
    )
    .all(user.id);
  const totalPending = await db
    .prepare(
      `SELECT COUNT(*) AS c FROM custom_words cw
       LEFT JOIN custom_word_ai cwa ON cwa.word_id = cw.id
       WHERE cw.user_id = ? AND cwa.word_id IS NULL`
    )
    .get(user.id);

  if (!pending.length) {
    return NextResponse.json({ enriched: 0, pending: 0, results: [] });
  }

  // 每日批次额度
  const batchesUsed = Math.floor((await aiUsedToday(user.id)) / BATCH);
  if (batchesUsed >= DAILY_BATCHES) {
    return NextResponse.json({ error: "今日 AI 补全次数已用完，明天再来吧" }, { status: 429 });
  }

  try {
    await aiConsume(user.id, pending.length);
  } catch (e) {
    if (e instanceof LimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  try {
    const data = await chatRobust(enrichMessages(pending), {
      json: true,
      maxTokens: 2600,
      temperature: 0.5,
      timeoutMs: 90000,
    });
    const results = Array.isArray(data.results) ? data.results : [];
    const byWord = new Map();
    results.forEach((r) => {
      const w = String(r.word || "").trim().toLowerCase();
      if (w) byWord.set(w, r);
    });
    const stmt = await db.prepare(
      `INSERT OR REPLACE INTO custom_word_ai (word_id, phonetic_hint, memory_tip, example_en, example_zh, enriched_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    let enriched = 0;
    const saved = [];
    const now = Date.now();
    for (const p of pending) {
      const r = byWord.get(String(p.word_en).trim().toLowerCase());
      if (!r) continue;
      await stmt.run(
        p.id,
        r.phonetic_hint ? String(r.phonetic_hint).trim() : null,
        r.memory_tip ? String(r.memory_tip).trim() : null,
        r.example_en ? String(r.example_en).trim() : null,
        r.example_zh ? String(r.example_zh).trim() : null,
        now
      );
      enriched += 1;
      saved.push({
        id: p.id,
        word: p.word_en,
        phonetic_hint: r.phonetic_hint || null,
        memory_tip: r.memory_tip || null,
        example_en: r.example_en || null,
        example_zh: r.example_zh || null,
      });
    }
    return NextResponse.json({
      enriched,
      pending: Number((totalPending && totalPending.c) || 0) - enriched,
      results: saved,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || "AI 服务暂时不可用" },
      { status: e.status || 503 }
    );
  }
}