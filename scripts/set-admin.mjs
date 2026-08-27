// scripts/set-admin.mjs —— 将用户提升为管理员（自包含，Node 18/20/22 通用）
// 用法（在 web/ 目录下）:  node scripts/set-admin.mjs <用户名>
import { join } from "node:path";
import { openDriver } from "./_backup.mjs";

const username = (process.argv[2] || "").trim();
if (!username) {
  console.log("用法: node scripts/set-admin.mjs <用户名>");
  console.log("示例: node scripts/set-admin.mjs 张三");
  process.exit(1);
}

const opened = await openDriver(join(process.cwd(), "data"));
if (!opened) {
  console.error("❌ 本地 SQLite 驱动不可用：请使用 Node >= 22.5，或安装 better-sqlite3（npm install better-sqlite3@11 --no-save）");
  process.exit(1);
}
const { db } = opened;
try {
  const user = db.prepare("SELECT id, role FROM users WHERE username = ?").get(username);
  if (!user) {
    console.log(`❌ 未找到用户「${username}」。请先注册该账号再执行本命令。`);
    process.exit(1);
  }
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
  console.log(`✅ 已将「${username}」设为管理员。重新登录后即可访问 /admin 管理后台。`);
} finally {
  try {
    db.close();
  } catch {
    /* ignore */
  }
}