// POST /api/events —— 打点事件批量上报（轻量，用于后台分析）
// 输入: { events: [{ event: "page_view", meta: {...} }, ...] }（meta 可选，会 JSON 序列化）
// 登录用户自动关联 user_id；游客 user_id 为 null（仅用于聚合统计）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

// ⚠️ 白名单之外的事件会被【静默丢弃】（第 37 行的 continue）。
// 客户端每新增一种事件名，必须同步登记到这里，否则前端看着上报成功、后端一条没存。
// 由此产生的坑：tests/logging.test.mjs 用的是假 fetch，测不出这一层。
const ALLOWED = new Set([
  "page_view",
  "train_start",
  "train_done",
  "exam_done",
  "chest_open",
  "pet_evolve",
  "badge_earned",
  "share_created",
  "answer", // 逐题作答日志（lib/memory.js 的 record() 里上报）
  "shadow_schedule", // 影子模式：新调度器"只算不用"的对比记录（lib/srs/shadow.js）
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
