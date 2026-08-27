// ============================================================
// lib/ai-cache.js —— AI 结果缓存（服务端，跨用户共享）
// 词跃 LexiRise · 数智化模块
// ------------------------------------------------------------
// 词条级结果（讲解/对比）对所有人生效：同词只花一次 API 费用；
// 每日级结果（练习/复习包）按 key 含日期自然过期。
// 30 天前的缓存条目在写入时顺带清理（防止无限膨胀）。
// ============================================================
import { getDb } from "./db.js";

const MAX_AGE_MS = 30 * 86400000;

export async function aiCacheGet(key) {
  const db = await getDb();
  const row = await db.prepare("SELECT result FROM ai_cache WHERE key = ?").get(String(key));
  if (!row) return null;
  try {
    return JSON.parse(row.result);
  } catch {
    return null;
  }
}

export async function aiCacheSet(key, value, ttlDays = 30) {
  const db = await getDb();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO ai_cache (key, result, created_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET result = excluded.result, created_at = excluded.created_at`
    )
    .run(String(key), JSON.stringify(value), now);
  // 顺带清理过期条目（低频，量小）
  try {
    await db
      .prepare("DELETE FROM ai_cache WHERE created_at < ?")
      .run(now - Math.max(MAX_AGE_MS, ttlDays * 86400000 * 2));
  } catch {
    /* ignore */
  }
  return value;
}

export default { aiCacheGet, aiCacheSet };