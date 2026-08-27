// ============================================================
// lib/limits.js —— AI 调用额度（防刷）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 登录用户：每日 DEFAULT_LOGIN_LIMIT 次生成（可用 AI_DAILY_LIMIT 覆盖）
// 游客    ：全站合计每日 DEFAULT_GUEST_LIMIT 次（userId 记 0）
// 数据表：ai_usage (user_id, date, calls)
// ============================================================
import { getDb } from "./db.js";

const DEFAULT_LOGIN_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 30;
const DEFAULT_GUEST_LIMIT = 300;

export function aiTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 今日已用次数 */
export async function aiUsedToday(userId) {
  const db = await getDb();
  const row = await db
    .prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND date = ?")
    .get(userId || 0, aiTodayStr());
  return row ? Number(row.calls) || 0 : 0;
}

export class LimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 429;
  }
}

/**
 * 消耗额度。超出限制抛 LimitError(429)。
 * @param {number} userId 0=游客（全局限额）
 */
export async function aiConsume(userId, n = 1) {
  const uid = userId || 0;
  const used = await aiUsedToday(uid);
  const limit = uid === 0 ? DEFAULT_GUEST_LIMIT : DEFAULT_LOGIN_LIMIT;
  if (used + n > limit) {
    throw new LimitError("今日 AI 次数已用完，明天再来吧");
  }
  const db = await getDb();
  const date = aiTodayStr();
  await db
    .prepare(
      `INSERT INTO ai_usage (user_id, date, calls) VALUES (?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET calls = excluded.calls`
    )
    .run(uid, date, used + n);
  return { used: used + n, limit };
}

export default { aiConsume, aiUsedToday, aiTodayStr, LimitError };