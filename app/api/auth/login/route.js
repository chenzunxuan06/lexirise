// POST /api/auth/login —— 登录
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyPassword, createSession, sessionCookie } from "@/lib/auth";

// 简单限速：同一 IP 每分钟最多 10 次登录尝试
const attempts = new Map();
const LIMIT = 10;
const WINDOW = 60000;

export async function POST(req) {
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, start: now };
  if (now - rec.start > WINDOW) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count += 1;
  attempts.set(ip, rec);
  if (rec.count > LIMIT) {
    return NextResponse.json({ error: "尝试次数过多，请一分钟后再试" }, { status: 429 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  const db = await getDb();
  const user = await db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "用户名或密码错误" }, { status: 401 });
  }

  await db.prepare("UPDATE users SET last_active = ? WHERE id = ?").run(Date.now(), user.id);
  const token = await createSession(user.id);
  const res = NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      role: user.role || "user",
    },
  });
  res.headers.append("Set-Cookie", sessionCookie(token));
  return res;
}
