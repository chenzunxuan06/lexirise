// scripts/_backup.mjs —— 备份核心（自包含，不依赖 lib/*，Node 18/20/22 通用）
// 说明：Node 直接执行 .mjs 时，导入无 "type":"module" 的 lib/*.js 在 Node 20 会
// 被当作 CommonJS 报 ESM 命名导出错误；因此备份/管理脚本不再 import lib，独立实现。
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** 打开本地 user.db（better-sqlite3 优先，node:sqlite 兜底），返回 { db, driver } */
export async function openDriver(dataDir) {
  // better-sqlite3 同步驱动（Node 18/20 部署环境）
  try {
    const mod = await import("better-sqlite3");
    const Database = mod.default || mod;
    const db = new Database(join(dataDir, "user.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 8000");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    return { db, driver: "better-sqlite3" };
  } catch {
    /* better-sqlite3 未安装（Node 22+ 无需） */
  }
  // Node 内置 node:sqlite（Node 22.5+）
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "user.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 8000;");
    db.exec("PRAGMA synchronous = NORMAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    return { db, driver: "node:sqlite" };
  } catch {
    return null;
  }
}

/**
 * 执行一次一致性备份（VACUUM INTO 快照），保留最近 keep 份。
 * 返回 { file, driver }；远程数据库模式返回 { remote: true }。
 */
export async function runBackup({ dir = "data/backups", keep = 7 } = {}) {
  if (process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN) {
    return { remote: true };
  }
  const DATA_DIR = join(process.cwd(), "data");
  const BACKUP_DIR = join(process.cwd(), dir);
  const opened = await openDriver(DATA_DIR);
  if (!opened) {
    throw new Error("本地 SQLite 驱动不可用：请使用 Node >= 22.5，或安装 better-sqlite3（npm install better-sqlite3@11 --no-save）");
  }
  const { db, driver } = opened;
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(0, 14);
    const out = join(BACKUP_DIR, `lexirise-${stamp}.db`);
    const q = String(out).replace(/'/g, "''");
    db.exec(`VACUUM INTO '${q}'`);
    // 只保留最近 keep 份
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => /^lexirise-\d+\.db$/.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) {
      try {
        rmSync(join(BACKUP_DIR, f), { force: true });
      } catch {
        /* ignore */
      }
    }
    return { file: out, driver };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

export default { openDriver, runBackup };