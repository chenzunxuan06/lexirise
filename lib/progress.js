// ============================================================
// lib/progress.js —— 今日学习口径统一层（方向C 阶段-1b，缺陷 #2）
// ------------------------------------------------------------
// 目的：首页「今天该背 N 词」、训练页今日模式实际出题数，
//       必须来自同一个函数、同一份当前状态 —— 显示多少，进去就出多少。
// 数字纪律：对外只暴露"可行动数字"（今天 N · 已背 N · 剩下 N · 再对 N 次），
//       全书总量仅作为统计页进度条分母使用，不提供总量文案接口。
// ============================================================

import { memory, wrongBook, plan, stats } from "./memory";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 今晚/今日到期复习词数（与今日模式出题共用同一道筛选） */
export function dueCount(words) {
  const m = memory.load();
  const now = Date.now();
  return words.filter((w) => {
    const s = m[w.id];
    return s && s.lv > 0 && s.due <= now;
  }).length;
}

/** 今天还差几个新词（每日目标 − 今日已学） */
export function newRemain() {
  const goal = plan.load().dailyNew || 10;
  const todayN = stats.today().n;
  return Math.max(0, goal - todayN);
}

// ------------------------------------------------------------
// 每日复习上限（2026-09-30 · 批次 B1）
// 为什么必须有：没有上限就是"欠多少还多少"。用户几天不来，到期数会堆起来——
//   实测一个只背了 74 个词的用户，因为 24 天没来，单次就出现「到期 56」；
//   1535 词时这个数字会到上千。行业里都封顶（Anki 默认 200/天、墨墨可设每日上限）。
// 规则：超出的到期词**顺延到明天**（不是"欠债"）。因为按 due 升序取，
//   最过期的最先被取到 → 明天自然优先补上最老的，不会无限堆积。
// 存储：`plan.reviewCap`（随账号同步）；0 = 不封顶，缺省 = 40。
// ------------------------------------------------------------
export const REVIEW_CAP_CHOICES = [20, 40, 60, 0]; // 0 = 全部
export const DEFAULT_REVIEW_CAP = 40;

/** 读「每日复习上限」；返回 0 表示不封顶 */
export function readReviewCap() {
  const p = plan.load() || {};
  if (p.reviewCap === 0) return 0; // 用户显式选了"全部"
  const n = Number(p.reviewCap);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REVIEW_CAP;
}

/** 写「每日复习上限」；返回落库后的值。
 *  ⚠️ 非法输入一律**回落默认 40（封顶）**，绝不落成 0 ——
 *  0 的含义是"不封顶"，若坏值映射成 0，一次数据损坏就会把上限关掉，等于回到"欠多少还多少"。 */
export function saveReviewCap(n) {
  const p = plan.load() || {};
  const v = n === "" || n === null || n === undefined ? NaN : Number(n);
  p.reviewCap = Number.isInteger(v) && v >= 0 ? v : DEFAULT_REVIEW_CAP;
  plan.save(p);
  return p.reviewCap;
}

/**
 * 今日模式组题（唯一真源）：
 * 到期复习 + 错词 + 新词（补每日目标）。
 *
 * @param {Array} words 全量词条
 * @param {Object} [opts]
 * @param {number} [opts.dueLimit] 本次最多做几个到期词；0 = 不封顶；缺省读 plan.reviewCap
 * @param {{due?:boolean,wrong?:boolean,new?:boolean}} [opts.include] 要哪几块；
 *        **缺省 = 三块全要**（保持旧调用方行为不变）。显式传入时，未勾的块不参与，
 *        且不再走"兜底 10 词"（否则"我不想做"会变成"硬塞 10 题"）。
 *
 * 返回：deck / due（实际选入，已封顶）/ dueAll（到期总数）/ deferred（顺延到明天）
 *      / wrong / fresh / total（total 是求和字段，批次 B4 会删掉，别在新代码里用它）
 */
export function composeDailyDeck(words, opts = {}) {
  const m = memory.load();
  const now = Date.now();
  const byId = new Map(words.map((w) => [w.id, w]));

  const inc = Object.assign({ due: true, wrong: true, new: true }, opts.include || {});
  const explicit = !!opts.include; // 调用方是否显式指定了"要哪几块"
  const cap = opts.dueLimit === undefined ? readReviewCap() : Number(opts.dueLimit) || 0;

  // 1) 到期复习：按 due 升序（最过期的优先）→ 截断到上限。
  //    ⚠️ 这里不能打乱顺序再截，否则"顺延"会变成随机丢弃，最老的永远轮不到。
  const allDue = words
    .filter((w) => {
      const s = m[w.id];
      return s && s.lv > 0 && s.due <= now;
    })
    .sort((a, b) => (m[a.id].due || 0) - (m[b.id].due || 0));
  const dueTake = cap > 0 ? Math.min(cap, allDue.length) : allDue.length;
  const dueWords = inc.due ? allDue.slice(0, dueTake) : [];
  // 排除集用 allDue（不是 dueWords）：否则被封顶挤出去的词会从"错词"溜回来，上限就白设了
  const dueIds = new Set(allDue.map((w) => w.id));

  // 2) 错词（排除全部到期词，按错误次数从多到少）
  const allWrongIds = wrongBook
    .entries()
    .sort((a, b) => (b[1].n || 0) - (a[1].n || 0))
    .map(([id]) => Number(id))
    .filter((id) => !dueIds.has(id));
  // 错词取几条沿用旧公式，但用 allDue.length 而不是 dueWords.length：
  // 这样"取消到期块 / 调低上限"不会连带把错题块的数字也改掉（数字要保持稳定）
  const newTake = inc.new ? newRemain() : 0;
  const wrongTake = inc.wrong
    ? Math.min(allWrongIds.length, Math.max(1, Math.ceil((allDue.length + newTake) * 0.5)))
    : 0;
  const wrong = allWrongIds.slice(0, wrongTake).map((id) => byId.get(id)).filter(Boolean);
  const wrongSet = new Set(allWrongIds); // 排除用全集，同样为了让数字稳定

  // 3) 新词（未学过，且没在到期/错词候选里）
  const newW = inc.new
    ? shuffle(
        words.filter(
          (w) => (!m[w.id] || m[w.id].lv === 0) && !dueIds.has(w.id) && !wrongSet.has(w.id)
        )
      ).slice(0, newTake)
    : [];

  let deckWords = shuffle([...dueWords, ...wrong, ...newW]);
  // 兜底只在"调用方没指定要哪几块"时生效（旧调用方的全部学完场景）
  if (!deckWords.length && !explicit) deckWords = shuffle(words).slice(0, 10);

  return {
    deck: deckWords,
    due: dueWords.length, // 实际选入（已封顶）
    dueAll: allDue.length, // 到期总数（未封顶）
    deferred: inc.due ? allDue.length - dueWords.length : 0, // 顺延到明天
    wrong: wrong.length,
    fresh: newW.length,
    total: deckWords.length, // ⚠️ B4 删除
  };
}

/** 今日总账（首页快路径用）：今天该背 N 词 = 到期 + 错词 + 新词剩余 */
export function todaySummary(words, opts) {
  const d = composeDailyDeck(words, opts);
  return { ...d, todo: d.total };
}

/** 「再答对 N 次就掌握」：lv≥6 为掌握，差几次用 6 − lv 算 */
export function toMastery(id) {
  const s = memory.get(id);
  if (!s) return 6;
  if (s.lv >= 6) return 0;
  return Math.max(1, 6 - s.lv);
}

/** 已学（lv>0，与首页/目录进度条同口径） */
export function learnedCount(words) {
  const m = memory.load();
  return words.filter((w) => m[w.id] && m[w.id].lv > 0).length;
}

export default { dueCount, newRemain, composeDailyDeck, todaySummary, toMastery, learnedCount, readReviewCap, saveReviewCap, REVIEW_CAP_CHOICES, DEFAULT_REVIEW_CAP };