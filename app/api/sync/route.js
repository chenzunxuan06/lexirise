// /api/sync —— 学习数据同步（GET 拉取 / POST 推送）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

const FIELDS = ["memory", "wrong", "favs", "stats", "plan", "exams"];

function safeJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export async function GET(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const db = await getDb();
  const row = await db.prepare("SELECT * FROM user_data WHERE user_id = ?").get(user.id);
  if (!row) {
    return NextResponse.json({ data: null });
  }
  const data = {};
  for (const f of FIELDS) data[f] = safeJson(row[f], f === "exams" ? [] : {});
  data.ts = row.ts || 0;
  return NextResponse.json({ data });
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
  const ts = Number(body.ts) || Date.now();
  const now = Date.now();
  await db.prepare("UPDATE users SET last_active = ? WHERE id = ?").run(now, user.id);

  const existing = await db.prepare("SELECT * FROM user_data WHERE user_id = ?").get(user.id);
  if (existing && Number(existing.ts) > ts) {
    return NextResponse.json({ ok: true, stale: true });
  }

  const vals = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (v !== undefined) {
      vals[f] = JSON.stringify(v);
    } else if (existing && existing[f] !== undefined) {
      vals[f] = existing[f];
    } else {
      vals[f] = f === "exams" ? "[]" : "{}";
    }
  }

  await db
    .prepare(
      `INSERT INTO user_data (user_id, memory, wrong, favs, stats, plan, exams, ts, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         memory = excluded.memory, wrong = excluded.wrong, favs = excluded.favs,
         stats = excluded.stats, plan = excluded.plan, exams = excluded.exams,
         ts = excluded.ts, updated_at = excluded.updated_at`
    )
    .run(user.id, vals.memory, vals.wrong, vals.favs, vals.stats, vals.plan, vals.exams, ts, now);

  return NextResponse.json({ ok: true });
}
