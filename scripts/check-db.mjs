// 只读检查数据库内容量（不修改任何数据）
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/user.db", { readOnly: true });
for (const t of ["users", "sessions", "user_data", "events", "shares", "ai_cache", "ai_usage"]) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
    console.log(`${t}: ${r.c}`);
  } catch (e) {
    console.log(`${t}: ERR ${e.message}`);
  }
}
try {
  const u = db.prepare("SELECT id, username, role, created_at FROM users ORDER BY id LIMIT 20").all();
  console.log("users sample:", JSON.stringify(u));
} catch (e) {
  console.log("users sample ERR", e.message);
}
db.close();