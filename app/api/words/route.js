// /api/words —— 我的词表（GET 列表 / POST 批量添加 / DELETE 删除）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const db = await getDb();
  const rows = await db
    .prepare(
      `SELECT cw.id, cw.word_en, cw.phonetic, cw.pos, cw.definition_zh, cw.created_at,
              cwa.phonetic_hint, cwa.memory_tip, cwa.example_en, cwa.example_zh, cwa.enriched_at
       FROM custom_words cw
       LEFT JOIN custom_word_ai cwa ON cwa.word_id = cw.id
       WHERE cw.user_id = ? ORDER BY cw.id DESC`
    )
    .all(user.id);
  return NextResponse.json({
    words: rows.map((r) => ({
      id: r.id,
      word_en: r.word_en,
      phonetic: r.phonetic,
      pos: r.pos,
      definition_zh: r.definition_zh,
      created_at: r.created_at,
      ai: r.enriched_at
        ? {
            phonetic_hint: r.phonetic_hint,
            memory_tip: r.memory_tip,
            example_en: r.example_en,
            example_zh: r.example_zh,
            enriched_at: r.enriched_at,
          }
        : null,
    })),
  });
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const db = await getDb();
  const list = Array.isArray(body.words) ? body.words : [body];
  const clean = [];
  const seen = new Set();
  const existingRows = await db
    .prepare("SELECT word_en FROM custom_words WHERE user_id = ?")
    .all(user.id);
  const existing = new Set(existingRows.map((r) => String(r.word_en).toLowerCase()));

  for (const item of list) {
    const word_en = String(item.word_en || "").trim();
    const definition_zh = String(item.definition_zh || "").trim();
    if (!word_en || !definition_zh) continue;
    const key = word_en.toLowerCase();
    if (seen.has(key) || existing.has(key)) continue;
    seen.add(key);
    clean.push({
      word_en,
      phonetic: String(item.phonetic || "").trim() || null,
      pos: String(item.pos || "").trim() || null,
      definition_zh,
    });
  }
  if (clean.length === 0) {
    return NextResponse.json({ error: "没有可添加的词（请检查格式或是否已存在）" }, { status: 400 });
  }
  const now = Date.now();
  const stmt = await db.prepare(
    "INSERT INTO custom_words (user_id, word_en, phonetic, pos, definition_zh, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );
  for (const c of clean) {
    await stmt.run(user.id, c.word_en, c.phonetic, c.pos, c.definition_zh, now);
  }
  return NextResponse.json({ added: clean.length, skipped: list.length - clean.length });
}

export async function DELETE(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const db = await getDb();
  const info = await db.prepare("DELETE FROM custom_words WHERE id = ? AND user_id = ?").run(id, user.id);
  return NextResponse.json({ ok: info.changes > 0 });
}
