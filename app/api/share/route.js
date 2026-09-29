// POST /api/share —— 为当前登录用户创建/获取家长周报分享链接
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const db = await getDb();
  // 复用已有 token（一个用户固定一个分享链接）
  const existing = await db.prepare("SELECT token FROM shares WHERE user_id = ?").get(user.id);
  if (existing) {
    return NextResponse.json({ token: existing.token });
  }
  const token = randomBytes(16).toString("hex");
  await db.prepare("INSERT INTO shares (token, user_id, created_at) VALUES (?, ?, ?)").run(token, user.id, Date.now());
  return NextResponse.json({ token });
}
