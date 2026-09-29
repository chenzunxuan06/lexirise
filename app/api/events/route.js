// POST /api/events —— 打点事件批量上报（轻量，用于后台分析）
// 输入: { events: [{ event: "page_view", meta: {...} }, ...] }（meta 可选，会 JSON 序列化）
// 登录用户自动关联 user_id；游客 user_id 为 null（仅用于聚合统计）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

const ALLOWED = new Set([
  "page_view",
  "train_start",
  "train_done",
  "exam_done",
  "chest_open",
  "pet_evolve",
  "badge_earned",
  "share_created",
]);

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const list = Array.isArray(body.events) ? body.events : [];
  if (!list.length) return NextResponse.json({ ok: true });

  const user = await getUserFromRequest(req).catch(() => null);
  const db = await getDb();
  const now = Date.now();

  const stmt = await db.prepare("INSERT INTO events (user_id, event, meta, ts) VALUES (?, ?, ?, ?)");
  let n = 0;
  for (const e of list.slice(0, 50)) {
    const ev = String(e.event || "");
    if (!ALLOWED.has(ev)) continue;
    let meta = "{}";
    try {
      meta = JSON.stringify(e.meta || {});
    } catch {
      /* ignore */
    }
    await stmt.run(user ? user.id : null, ev, meta, now);
    n++;
  }
  return NextResponse.json({ ok: true, count: n });
}
