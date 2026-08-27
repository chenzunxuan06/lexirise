// lib/db.js —— 账号系统数据库（双后端适配器）
// ------------------------------------------------------------
// 后端自动选择：
//   设置了 TURSO_URL + TURSO_AUTH_TOKEN  → 远程 Turso（libSQL，用于 Vercel 等无磁盘环境）
//   否则                                → 本地 SQLite（better-sqlite3，Node 18+ 全兼容）
// 两个后端都暴露统一的异步接口:
//   await db.exec(sql)
//   await db.prepare(sql).run(...args)  → { changes, lastInsertRowid }
//   await db.prepare(sql).get(...args)  → row | undefined
//   await db.prepare(sql).all(...args)  → row[]
// SQL 均为 SQLite 方言（libSQL 兼容），两侧通用。
// 懒加载单例：模块导入时不触碰数据库（避免 Next 构建期锁冲突）。
// Node 要求: 22.5+ 零依赖；Node 18/20 需 better-sqlite3（CloudStudio 部署脚本自动装）
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;
export const isRemote = () => !!(TURSO_URL && TURSO_TOKEN);

// 建表语句（SQLite / libSQL 通用）
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nickname      TEXT,
    role          TEXT NOT NULL DEFAULT 'user',
    created_at    INTEGER NOT NULL,
    last_active   INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS user_data (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    memory     TEXT NOT NULL DEFAULT '{}',
    wrong      TEXT NOT NULL DEFAULT '{}',
    favs       TEXT NOT NULL DEFAULT '{}',
    stats      TEXT NOT NULL DEFAULT '{}',
    plan       TEXT NOT NULL DEFAULT '{}',
    exams      TEXT NOT NULL DEFAULT '[]',
    ts         INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS custom_words (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_en       TEXT NOT NULL,
    phonetic      TEXT,
    pos           TEXT,
    definition_zh TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_custom_words_user ON custom_words (user_id)`,
  // ---------- AI 模块（数智化） ----------
  `CREATE TABLE IF NOT EXISTS ai_cache (
    key         TEXT PRIMARY KEY,
    result      TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ai_usage (
    user_id INTEGER NOT NULL,
    date    TEXT NOT NULL,
    calls   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS custom_word_ai (
    word_id      INTEGER PRIMARY KEY REFERENCES custom_words(id) ON DELETE CASCADE,
    phonetic_hint TEXT,
    memory_tip   TEXT,
    example_en   TEXT,
    example_zh   TEXT,
    enriched_at  INTEGER NOT NULL
  )`,
];

// ---------- 本地 SQLite 后端（双驱动自适应） ----------
// 优先 better-sqlite3（Node 18/20 用，CloudStudio 部署脚本会自动安装）；
// 其次 Node 内置 node:sqlite（Node 22.5+ 零依赖，本机/自托管用）。
async function loadLocalDriver() {
  try {
    const mod = await import(/* webpackIgnore: true */ "better-sqlite3");
    return { kind: "better-sqlite3", Database: mod.default || mod };
  } catch {
    /* better-sqlite3 未安装（Node 22+ 无需） */
  }
  try {
    const { DatabaseSync } = await import("node:sqlite");
    return { kind: "node:sqlite", DatabaseSync };
  } catch {
    return null;
  }
}

async function makeLocal() {
  const DATA_DIR = join(process.cwd(), "data");
  mkdirSync(DATA_DIR, { recursive: true });
  const driver = await loadLocalDriver();
  if (!driver) {
    throw new Error(
      "本地 SQLite 驱动不可用：请使用 Node >= 22.5，或在 Node 18/20 上执行 npm install better-sqlite3@11 --no-save"
    );
  }

  let raw;
  if (driver.kind === "better-sqlite3") {
    raw = new driver.Database(join(DATA_DIR, "user.db"));
    raw.pragma("journal_mode = WAL");
    raw.pragma("busy_timeout = 8000");
    raw.pragma("synchronous = NORMAL");
    raw.pragma("foreign_keys = ON");
  } else {
    raw = new driver.DatabaseSync(join(DATA_DIR, "user.db"));
    try {
      raw.exec("PRAGMA journal_mode = WAL;");
    } catch {
      /* 已有连接在初始化 */
    }
    raw.exec("PRAGMA busy_timeout = 8000;");
    raw.exec("PRAGMA synchronous = NORMAL;");
    raw.exec("PRAGMA foreign_keys = ON;");
  }

  return {
    exec: (sql) => Promise.resolve(raw.exec(sql)),
    prepare: (sql) => {
      const stmt = raw.prepare(sql);
      return {
        run: (...args) => Promise.resolve(stmt.run(...args)),
        get: (...args) => Promise.resolve(stmt.get(...args)),
        all: (...args) => Promise.resolve(stmt.all(...args)),
      };
    },
    // 本地模式专属：一致性快照备份
    vacuumInto: (file) => raw.exec(`VACUUM INTO '${String(file).replace(/'/g, "''")}'`),
    close: () => {
      try {
        raw.close();
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------- 远程 Turso 后端（Vercel / Serverless） ----------
function makeTurso() {
  const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  return {
    exec: async (sql) => {
      await client.execute({ sql });
    },
    prepare: (sql) => ({
      run: async (...args) => {
        const r = await client.execute({ sql, args });
        return {
          changes: Number((r.meta && r.meta.rows_written) || 0),
          lastInsertRowid: Number((r.meta && r.meta.last_insert_rowid) || 0),
        };
      },
      get: async (...args) => {
        const r = await client.execute({ sql, args });
        return r.rows[0] || undefined;
      },
      all: async (...args) => {
        const r = await client.execute({ sql, args });
        return r.rows;
      },
    }),
    vacuumInto: () => {
      throw new Error("远程数据库不支持 VACUUM INTO，请使用 JSON 备份或 Turso 控制台");
    },
    close: () => Promise.resolve(),
  };
}

let _db = null;
let _initPromise = null;

export async function getDb() {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      const db = isRemote() ? makeTurso() : await makeLocal();
      // 建表（含老库补列迁移）
      for (const s of SCHEMA) {
        await db.exec(s);
      }
      if (!isRemote()) {
        const local = db;
        for (const s of [
          "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
          "ALTER TABLE users ADD COLUMN last_active INTEGER NOT NULL DEFAULT 0",
        ]) {
          try {
            await local.exec(s);
          } catch {
            /* 已有该列 */
          }
        }
      }
      _db = db;
      return _db;
    })();
  }
  return _initPromise;
}

/** 登录会话有效期：30 天 */
export const SESSION_DAYS = 30;

export default getDb;
