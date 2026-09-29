// GET /api/admin/analytics —— 行为分析（仅管理员，基于 events 打点表）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAdminFromRequest } from "@/lib/auth";

const DAY = 86400000;

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function label(t) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export async function GET(req) {
  if (!(await getAdminFromRequest(req))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  const db = await getDb();
  const now = Date.now();

  // 最近 14 天 DAU / 访问量（page_view）
  const since = now - 14 * DAY;
  const rows = await db.prepare("SELECT user_id, event, ts FROM events WHERE ts >= ?").all(since);
  const byDay = new Map();
  for (let i = 13; i >= 0; i--) {
    const t = now - i * DAY;
    byDay.set(dayKey(t), { date: dayKey(t), label: label(t), users: 0, views: 0, userSet: new Set() });
  }
  for (const r of rows) {
    const bucket = byDay.get(dayKey(r.ts));
    if (!bucket) continue;
    if (r.event === "page_view") bucket.views += 1;
    if (r.user_id != null) bucket.userSet.add(r.user_id);
  }
  const dau14 = [...byDay.values()].map((b) => ({ date: b.date, label: b.label, users: b.userSet.size, views: b.views }));

  // 最近 7 天事件分布
  const since7 = now - 7 * DAY;
  const rows7 = rows.filter((r) => r.ts >= since7);
  const eventCount = new Map();
  for (const r of rows7) {
    eventCount.set(r.event, (eventCount.get(r.event) || 0) + 1);
  }
  const eventDist = [...eventCount.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count);

  // 总量
  const totalUsers = (await db.prepare("SELECT COUNT(*) AS c FROM users").get()).c;
  const totalEvents = (await db.prepare("SELECT COUNT(*) AS c FROM events").get()).c;

  return NextResponse.json({
    dau14,
    eventDist,
    totals: { users: totalUsers, events: totalEvents, events7d: rows7.length },
  });
}
