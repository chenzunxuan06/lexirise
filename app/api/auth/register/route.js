// POST /api/auth/register —— 注册（用户名+密码）
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashPassword, createSession, sessionCookie } from "@/lib/auth";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const db = await getDb();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const nickname = String(body.nickname || "").trim();

  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(username)) {
    return NextResponse.json(
      { error: "用户名需 2~20 位，仅限中文、字母、数字、下划线" },
      { status: 400 }
    );
  }
  if (password.length < 6 || password.length > 64) {
    return NextResponse.json({ error: "密码长度需 6~64 位" }, { status: 400 });
  }
  const exists = await db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) {
    return NextResponse.json({ error: "该用户名已被注册" }, { status: 409 });
  }

  const now = Date.now();
  const info = await db
    .prepare("INSERT INTO users (username, password_hash, nickname, created_at, last_active) VALUES (?, ?, ?, ?, ?)")
    .run(username, hashPassword(password), nickname || username, now, now);
  const userId = Number(info.lastInsertRowid);

  await db.prepare("INSERT INTO user_data (user_id, updated_at) VALUES (?, ?)").run(userId, now);

  const token = await createSession(userId);
  const res = NextResponse.json({
    user: { id: userId, username, nickname: nickname || username, role: "user" },
  });
  res.headers.append("Set-Cookie", sessionCookie(token));
  return res;
}
