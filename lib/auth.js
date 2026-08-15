// lib/auth.js —— 密码哈希（scrypt）+ 会话工具（异步数据库访问）
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, SESSION_DAYS } from "./db";

export const COOKIE_NAME = "lexirise_sid";

/** 密码哈希: "salt:hash" */
export function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(pw), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(":");
    const test = scryptSync(String(pw), salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
  } catch {
    return false;
  }
}

/** 创建会话，返回 token */
export async function createSession(userId) {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, now, now + SESSION_DAYS * 86400000);
  return token;
}

/** 按 token 取用户（未过期），同时清理过期会话 */
export async function userByToken(token) {
  if (!token) return null;
  const db = await getDb();
  const now = Date.now();
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  const row = await db
    .prepare(
      `SELECT u.id, u.username, u.nickname, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`
    )
    .get(token, now);
  return row || null;
}

export async function deleteSession(token) {
  if (!token) return;
  const db = await getDb();
  await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

/** 从 NextRequest 取当前登录用户 */
export async function getUserFromRequest(req) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return userByToken(token);
}

/** 从 NextRequest 取管理员（非管理员返回 null） */
export async function getAdminFromRequest(req) {
  const user = await getUserFromRequest(req);
  return user && user.role === "admin" ? user : null;
}

/** 生成 httpOnly Cookie 头 */
export function sessionCookie(token, maxAgeSec = SESSION_DAYS * 86400) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export const clearCookieHeader = `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
