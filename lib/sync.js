// ============================================================
// lib/sync.js —— 账号会话 + 学习数据同步层
// ------------------------------------------------------------
// 流程:
//   init()     页面加载时: 查 /api/auth/me -> 已登录则 pull() 服务器数据覆盖本地
//   login/register  登录/注册 -> pull() 后跳转
//   logout     登出
//   pull()     GET /api/sync  -> 服务器有数据则覆盖本地; 服务器为空则清空本地(新账号从零开始)
//   push()     把本地全部学习数据 POST 上去(带时间戳, 服务器防旧覆盖新)
//   自动推送:  订阅 memory.onChange, 登录状态下防抖 2s 自动 push
// ============================================================

import { DATA_KEYS, onChange } from "./memory";

const USER_KEY = "lexirise:user";
const TS_KEY = "lexirise:sync_ts";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* 空响应 */
  }
  if (!res.ok) {
    throw new ApiError(data.error || `请求失败 (${res.status})`, res.status);
  }
  return data;
}

function readLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export const sync = {
  user: null, // { id, username, nickname } | null
  ready: false,
  _listeners: new Set(),
  _inited: false,

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },
  notify() {
    this._listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  },

  /** 应用启动时调用一次 */
  async init() {
    if (this._inited) return;
    this._inited = true;
    try {
      const d = await fetchJson("/api/auth/me");
      this.user = d.user || null;
      if (this.user) {
        // 仅当本机没有任何学习数据时才拉服务器（新设备场景）
        // 避免刷新页面时把本地未同步的数据覆盖掉
        const hasLocal = DATA_KEYS.some((k) => {
          try {
            const v = localStorage.getItem(k);
            return !!v && v !== "{}" && v !== "[]";
          } catch {
            return false;
          }
        });
        if (!hasLocal) await this.pull();
      }
    } catch {
      this.user = null;
    }
    // 登录状态下自动推送
    onChange(() => this.schedulePush());
    this.ready = true;
    this.notify();
  },

  async login(username, password) {
    const d = await fetchJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.user = d.user;
    await this.pull();
    this.notify();
    return this.user;
  },

  async register(username, password, nickname) {
    const d = await fetchJson("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, nickname }),
    });
    this.user = d.user;
    await this.pull();
    this.notify();
    return this.user;
  },

  async logout() {
    try {
      await fetchJson("/api/auth/logout", { method: "POST" });
    } catch {
      /* 忽略网络错误 */
    }
    this.user = null;
    this.notify();
  },

  /** 服务器数据 -> 本地（登录/刷新时） */
  async pull() {
    const d = await fetchJson("/api/sync");
    const data = d.data;
    try {
      if (data && data.ts) {
        // 服务器有数据：覆盖本地
        localStorage.setItem(TS_KEY, String(data.ts));
        for (const k of DATA_KEYS) {
          const key = k.replace("lexirise:", "");
          localStorage.setItem(k, JSON.stringify(data[key] ?? (key === "exams" ? [] : {})));
        }
      } else {
        // 新账号：从零开始（不做旧数据迁移）
        for (const k of DATA_KEYS) localStorage.removeItem(k);
        localStorage.removeItem(TS_KEY);
      }
    } catch {
      /* localStorage 不可用则忽略 */
    }
  },

  /** 本地 -> 服务器（防抖推送） */
  async push() {
    if (!this.user) return;
    const now = Date.now();
    const payload = { ts: now };
    for (const k of DATA_KEYS) {
      const key = k.replace("lexirise:", "");
      payload[key] = readLocal(k, key === "exams" ? [] : {});
    }
    try {
      const d = await fetchJson("/api/sync", { method: "POST", body: JSON.stringify(payload) });
      if (d && !d.stale) {
        localStorage.setItem(TS_KEY, String(now));
      }
    } catch {
      /* 离线等场景静默，下次变更会重试 */
    }
  },

  _timer: null,
  schedulePush() {
    if (!this.user) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.push(), 2000);
  },
};

export default sync;
