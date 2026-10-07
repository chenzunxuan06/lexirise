// ============================================================
// lib/memory.js —— 学习记录本地存储层（localStorage，零后端）
// 词跃 LexiRise
// ------------------------------------------------------------
// memory:  每个单词的记忆状态 { [id]: { lv, due, lapses, last, ok, total, first } }
//          lv 0=未学, 1..8 熟练度; due 到期时间戳; 间隔表见 lib/srs/model.js
// wrong:   错题本 { [id]: { n, at } }
// favs:    生词本/收藏 { [id]: at }
// stats:   每日学习统计 { [date]: { new, review, correct, total } }
//
// 本层只负责【读写 localStorage】和【广播变更】；
// 记忆算法的状态迁移全部交给纯函数层 lib/srs/model.js —— 那一层能在 Node 里离线跑，
// 是回放、仿真与对照实验的地基。
// ============================================================

// 注意：这里必须写全 `.js` 扩展名。
// 项目其余地方用无扩展名（Next.js/webpack 风格），但 lib/memory.js 同时要被
// Node 测试直接 import，而 Node 的 ESM 解析器要求显式扩展名。
// 显式扩展名两边都能解析，所以从这一层开始统一带上。
import { nextState, retrievability } from "./srs/model.js";
import { track } from "./analytics.js";

const MEM_KEY = "lexirise:memory";
const WRONG_KEY = "lexirise:wrong";
const FAVS_KEY = "lexirise:favs";
const STATS_KEY = "lexirise:stats";
const PLAN_KEY = "lexirise:plan";
const EXAMS_KEY = "lexirise:exams";
export const GAME_KEY = "lexirise:game"; // 游戏化状态（XP/金币/宠物/徽章/图鉴等）

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
export const DATA_KEYS = [MEM_KEY, WRONG_KEY, FAVS_KEY, STATS_KEY, PLAN_KEY, EXAMS_KEY, GAME_KEY, "lexirise:focus"];

/** 供其他模块（如 lib/game.js）在写入数据后触发同步推送 */
export function notifyDataChange() {
  emit();
}

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
   * 记录一次作答结果。
   *
   * 状态迁移委托给纯函数 nextState()；同时把这次作答写入行为日志。
   * 日志走独立的 events 通道（缓冲上报、失败静默），不影响学习流程。
   *
   * 埋点放在这里而不是 6 个调用页面 —— 只有一个改动点，不可能漏。
   *
   * @param {number|string} id 单词 id
   * @param {boolean} ok 是否答对/认识
   * @param {boolean} isNew 是否首次学习该词
   * @param {object} [ctx] 可选补充信息 { mode, elapsed, rating }
   * @returns {object} 迁移后的记忆状态
   */
  record(id, ok, isNew = false, ctx = {}) {
    const m = this.load();
    const now = Date.now();
    const prev = m[id] || null;

    // 这次作答【之前】，模型认为他还有几成记得（T25）。
    //
    // ⚠️ 只有学过（lv>0）的词才有"预测"可言。lv=0 记 **null**，不记 0：
    //    lv=0 包含"从没见过"和"见过但没学会"两种情况，模型对两者都给不出概率。
    //    如果写成 0，将来的校准曲线会把"没有预测"当成"预测为 0%"来统计 ——
    //    整条曲线会被这个定义上的 0 淹没（仿真里实测：1483 个样本有 1471 个落在
    //    0–10% 这一箱，图完全没法看）。
    const rPred = prev && prev.lv > 0 ? retrievability(prev, now) : null;

    const { state, log } = nextState(prev, ok, now, isNew);
    m[id] = state;
    this.save(m);
    emit();

    // ⚠️ 事件名 "answer" 必须同时登记在 app/api/events/route.js 的 ALLOWED 白名单里，
    //    否则会被服务端静默丢弃。
    track("answer", {
      w: id,
      ok: ok ? 1 : 0,
      isNew: isNew ? 1 : 0,
      mode: ctx.mode || "",
      lv_before: log.lv_before,
      lv_after: log.lv_after,
      due_before: log.due_before,
      due_after: log.due_after,
      elapsed: ctx.elapsed || 0,
      rating: ctx.rating ?? null,
      r_pred: rPred, // 模型预测的保持率（0–1）；null = 模型给不出预测
      r_actual: ok ? 1 : 0, // 本次是否真的答对
    });

    return state;
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
  /** 新手指引选择的年级（7/8/9），训练与首页默认跟随 */
  setGrade(g) {
    const p = this.load();
    p.grade = g;
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
    // ok: 连对计数（消灭机制用）；再次答错清零重新计数
    w[id] = { n: (w[id] && w[id].n ? w[id].n : 0) + 1, at: Date.now(), ok: 0 };
    write(WRONG_KEY, w);
    emit();
  },
  /**
   * 错词答对一次：连对 +1；连对满 2 次自动移出错题本（消灭）
   * @returns {"cleared"|"progress"|null} cleared=已消灭, progress=还需再对, null=不在错题本
   */
  addOk(id) {
    const w = this.load();
    if (!w[id]) return null;
    const ok = (w[id].ok || 0) + 1;
    if (ok >= 2) {
      delete w[id];
      write(WRONG_KEY, w);
      emit();
      return "cleared";
    }
    w[id].ok = ok;
    write(WRONG_KEY, w);
    emit();
    return "progress";
  },
  has(id) {
    return !!this.load()[id];
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
  /** 补签：把指定日期写进统计（恢复连击用，值默认全 0） */
  patch(key, data = {}) {
    const s = this.load();
    s[key] = { n: 0, review: 0, correct: 0, total: 0, ...data };
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
