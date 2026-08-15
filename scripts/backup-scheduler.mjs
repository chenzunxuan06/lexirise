// scripts/backup-scheduler.mjs —— 无 cron 环境的每日备份调度器（PM2 常驻）
// 用法（CloudStudio/VPS 无 crontab 时）:
//   pm2 start scripts/backup-scheduler.mjs --name lexirise-backup && pm2 save
// 每天 03:00 自动执行 backup_db.mjs，保留最近 7 份
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_HOUR = 3;

function runBackup() {
  try {
    execSync("node scripts/backup_db.mjs", { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    console.error("备份失败:", e.message);
  }
}

function schedule() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(BACKUP_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const ms = next - now;
  console.log(`[backup] 下次自动备份: ${next.toLocaleString("zh-CN")}`);
  setTimeout(() => {
    console.log("[backup] 开始每日备份...");
    runBackup();
    schedule();
  }, ms);
}

schedule();
// 保持进程存活（PM2 下常驻）
setInterval(() => {}, 1 << 30);
