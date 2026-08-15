// POST /api/auth/logout —— 登出
import { NextResponse } from "next/server";
import { deleteSession, clearCookieHeader, COOKIE_NAME } from "@/lib/auth";

export async function POST(req) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookieHeader);
  return res;
}
