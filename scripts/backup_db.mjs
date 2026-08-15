// scripts/backup_db.mjs —— 手动备份账号数据库
// 用法（在 web/ 目录下）:  node scripts/backup_db.mjs
// 本地模式: 生成 web/data/backups/lexirise-YYYYMMDDHHmm.db（VACUUM INTO 一致性快照）
// 远程模式(设置了 TURSO_URL): 提示使用 Turso 控制台或 JSON 备份（管理后台可下载 JSON 备份）
import { getDb, isRemote } from "../lib/db.js";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

if (isRemote()) {
  console.log("⚠️ 当前为远程数据库模式（TURSO_URL 已设置）。");
  console.log("备份方式：登录 Turso 控制台 → 你的数据库 → Snapshot/Dump 导出；");
  console.log("或在管理后台「下载数据库备份」获取 JSON 全量导出。");
  process.exit(0);
}

const db = await getDb();
const stamp = new Date()
  .toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);
const dir = join(process.cwd(), "data", "backups");
mkdirSync(dir, { recursive: true });
const out = join(dir, `lexirise-${stamp}.db`);

db.vacuumInto(out);
console.log(`✅ 备份完成: ${out}`);
console.log("提示: 可配合系统计划任务每天执行一次；保留最近 7 份即可。");
