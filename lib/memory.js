// ============================================================
// lib/memory.js —— 学习记录本地存储层（localStorage，零后端）
// 词跃 LexiRise
// ------------------------------------------------------------
// memory:  每个单词的记忆状态 { [id]: { lv, due, lapses, last, ok, total, first } }
//          lv 0=未学, 1..8 熟练度; due 到期时间戳; 间隔按 2^n 天增长(SM-2 简化)
// wrong:   错题本 { [id]: { n, at } }
// favs:    生词本/收藏 { [id]: at }
// stats:   每日学习统计 { [date]: { new, review, correct, total } }
// ============================================================

const MEM_KEY = "lexirise:memory";
const WRONG_KEY = "lexirise:wrong";
const FAVS_KEY = "lexirise:favs";
const STATS_KEY = "lexirise:stats";
const PLAN_KEY = "lexirise:plan";
const EXAMS_KEY = "lexirise:exams";

// 变更通知：任何学习数据变化时触发（同步层订阅后自动推送服务器）
const subs = new Set();
export function onChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function emit() {
  subs.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

/** 全部本地学习数据的键（同步层按此推拉） */
export const DATA_KEYS = [MEM_KEY, WRONG_KEY, FAVS_KEY, STATS_KEY, PLAN_KEY, EXAMS_KEY];

function read(key, def) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : def;
  } catch {
    return def;
  }
}

function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}

const DAY = 86400000;

export const memory = {
  load() {
    return read(MEM_KEY, {});
  },
  save(m) {
    write(MEM_KEY, m);
  },
  get(id) {
    return this.load()[id] || null;
  },
  /**
   * 记录一次作答结果
   * @param {number|string} id 单词 id
   * @param {boolean} ok 是否答对/认识
   * @param {boolean} isNew 是否首次学习该词
   */
  record(id, ok, isNew = false) {
    const m = this.load();
    const now = Date.now();
    const cur = m[id] || { lv: 0, due: 0, lapses: 0, last: 0, ok: 0, total: 0, first: 0 };
    cur.total += 1;
    if (ok) {
      cur.ok += 1;
      cur.lv = Math.min(8, cur.lv + 1);
      const days = [0, 1, 2, 4, 7, 15, 30, 60, 120][cur.lv];
      cur.due = now + days * DAY;
    } else {
      cur.lapses += 1;
      cur.lv = Math.max(0, cur.lv >= 2 ? cur.lv - 2 : 0);
      cur.due = now + 10 * 60000; // 10 分钟后复习
    }
    cur.last = now;
    if (isNew) cur.first = cur.first || now;
    m[id] = cur;
    this.save(m);
    emit();
    return cur;
  },
  /** 到期需复习的词 */
  dueWords(words) {
    const m = this.load();
    const now = Date.now();
    return words.filter((w) => {
      const s = m[w.id];
      return s && s.lv > 0 && s.due <= now;
    });
  },
  /** 未学过(新词)数量 */
  newCount(words) {
    const m = this.load();
    return words.filter((w) => !m[w.id] || m[w.id].lv === 0).length;
  },
  /** 已学过的词 id 集合 */
  learnedIds() {
    return new Set(Object.keys(this.load()));
  },
  learnedCount() {
    return Object.keys(this.load()).length;
  },
  /** 熟练度 >= 6 视为已掌握 */
  masteredCount() {
    const m = this.load();
    return Object.values(m).filter((s) => s.lv >= 6).length;
  },
  /** 记忆状态分布: 新词(0) / 学习中(1-5) / 已掌握(>=6) */
  distribution(words) {
    const m = this.load();
    let n = 0,
      learning = 0,
      mastered = 0;
    words.forEach((w) => {
      const s = m[w.id];
      if (!s || s.lv === 0) n += 1;
      else if (s.lv >= 6) mastered += 1;
      else learning += 1;
    });
    return { n, learning, mastered, total: words.length };
  },
  /** 按状态筛选: all | new | learning | mastered */
  byStatus(words, status) {
    const m = this.load();
    return words.filter((w) => {
      const s = m[w.id];
      const lv = s ? s.lv : 0;
      if (status === "new") return lv === 0;
      if (status === "learning") return lv >= 1 && lv < 6;
      if (status === "mastered") return lv >= 6;
      return true;
    });
  },
};

/** 每日学习目标（存 localStorage） */
export const plan = {
  load() {
    return read(PLAN_KEY, { dailyNew: 10 });
  },
  save(p) {
    write(PLAN_KEY, p);
  },
  setDailyNew(n) {
    const p = this.load();
    p.dailyNew = n;
    this.save(p);
    emit();
    return p;
  },
};

/** 考试历史记录（本地 + 随账号同步） */
export const exams = {
  load() {
    return read(EXAMS_KEY, []);
  },
  add(rec) {
    const l = this.load();
    l.push({ ...rec, at: Date.now() });
    write(EXAMS_KEY, l.slice(-300));
    emit();
  },
  /** 最新在前 */
  list() {
    return this.load().slice().reverse();
  },
  clear() {
    write(EXAMS_KEY, []);
    emit();
  },
};

export const wrongBook = {
  load() {
    return read(WRONG_KEY, {});
  },
  add(id) {
    const w = this.load();
    w[id] = { n: (w[id] && w[id].n ? w[id].n : 0) + 1, at: Date.now() };
    write(WRONG_KEY, w);
    emit();
  },
  remove(id) {
    const w = this.load();
    delete w[id];
    write(WRONG_KEY, w);
    emit();
  },
  clear() {
    write(WRONG_KEY, {});
    emit();
  },
  count() {
    return Object.keys(this.load()).length;
  },
  entries() {
    return Object.entries(this.load());
  },
};

export const favs = {
  load() {
    return read(FAVS_KEY, {});
  },
  toggle(id) {
    const f = this.load();
    if (f[id]) delete f[id];
    else f[id] = Date.now();
    write(FAVS_KEY, f);
    emit();
    return !!f[id];
  },
  has(id) {
    return !!this.load()[id];
  },
  remove(id) {
    const f = this.load();
    delete f[id];
    write(FAVS_KEY, f);
    emit();
  },
  count() {
    return Object.keys(this.load()).length;
  },
  entries() {
    return Object.entries(this.load());
  },
};

export const stats = {
  keyOf(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  },
  todayKey() {
    return this.keyOf(new Date());
  },
  load() {
    return read(STATS_KEY, {});
  },
  /** 记录今日学习 */
  add({ n = 0, review = 0, correct = 0, total = 0 }) {
    const s = this.load();
    const k = this.todayKey();
    const d = s[k] || { n: 0, review: 0, correct: 0, total: 0 };
    d.n += n;
    d.review += review;
    d.correct += correct;
    d.total += total;
    s[k] = d;
    write(STATS_KEY, s);
    emit();
  },
  today() {
    return this.load()[this.todayKey()] || { n: 0, review: 0, correct: 0, total: 0 };
  },
  /** 连续打卡天数 */
  streakDays() {
    const s = this.load();
    const keys = Object.keys(s).sort();
    if (!keys.length) return 0;
    let streak = 0;
    const d = new Date();
    if (!s[this.todayKey()]) d.setDate(d.getDate() - 1);
    while (s[this.keyOf(d)]) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  },
  /** 最近 count 天记录（含 0 天） */
  days(count) {
    const s = this.load();
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = this.keyOf(d);
      out.push({ key: k, label: `${d.getMonth() + 1}/${d.getDate()}`, ...(s[k] || { n: 0, review: 0, correct: 0, total: 0 }) });
    }
    return out;
  },
  /** 总学习天数 */
  totalDays() {
    return Object.keys(this.load()).length;
  },
};

export function todayStr() {
  return stats.todayKey();
}

export default { memory, wrongBook, favs, stats, plan, exams, todayStr };
