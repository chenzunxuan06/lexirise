// ============================================================
// lib/srs/compare.js —— 对照实验：约束调度 vs 现行"按到期排序"（纯函数）
// ------------------------------------------------------------
// 用途：对比视图（T12）。同一批词、同一份状态、同一个范围，两种调度各选一遍，
//       把差异摆出来 —— 评委不需要懂算法，只要看到"左边一片灰、右边一片绿"。
//
// 关于 baseline 的说明（写进材料时要诚实）：
//   现行产品（lib/progress.js 的 composeDailyDeck）实际是
//   "到期词按 due 升序 + 错词 + 新词（打乱）"。这里刻意做了两点简化：
//     ① 不打乱 —— 对比必须可复现，随机化会让两次结果没法比
//     ② 不含错题本 —— 错题本在 localStorage，保持本模块纯函数
//   所以 baseline 是"现行行为的忠实简化模型"，不是逐行复刻。
//   它的关键特征被完整保留：**完全不知道考试范围** —— 这正是要对比的东西。
//
// 单元键一律用 schedule.js 的 unitKeyOf，**不在这里另写一份** ——
// 同一个格式抄两处，改一处就会悄悄对不上。
// ============================================================

import { schedule } from "./schedule.js";
import { unitKeyOf } from "../units.js";

/**
 * 基线调度：按到期时间升序（最过期的优先），不足则用新词补齐。
 * 这是"普通间隔重复 App 会怎么做"。
 *
 * @param {object} [opts]
 * @param {(fresh:Array) => Array} [opts.freshOrder]
 *        新词的排序方式。**默认按 id 升序** —— 那是"词表顺序"，可复现，
 *        T12 的对比视图就用它。
 *        但线上真实行为是【打乱】（lib/progress.js 的 composeDailyDeck 里
 *        有一个 shuffle(newWords)）。做长时间仿真时这个差别是决定性的：
 *        按 id 升序会让失败过的词永远堵在队首、把预算吃光 ——
 *        那会【低估基线】，把对比变成不公平。
 *        所以 lib/srs/sim.js 会传入一个【带种子的】打乱器：
 *        既还原真实行为，又保持可复现。
 *        ⚠️ 传入的函数必须返回新数组，不得就地修改 fresh。
 */
export function baselineSchedule(words, states = {}, c = {}, budget = {}, opts = {}) {
  const now = Number(c.now) || 0;
  const st = states || {};
  const count = Math.max(0, Math.floor(Number(budget.count) || 0)) || Infinity;

  const list = (words || []).filter((w) => w && w.entry_type === "word" && w.id !== undefined);

  const due = [];
  const fresh = [];
  for (const w of list) {
    const s = st[w.id];
    if (s && s.lv > 0 && s.due > 0 && s.due <= now) due.push(w);
    else if (!s || !s.lv) fresh.push(w);
  }
  // 到期升序（最老的先）；同 due 用 id 升序保证可复现
  due.sort((a, b) => (st[a.id].due || 0) - (st[b.id].due || 0) || Number(a.id) - Number(b.id));
  fresh.sort((a, b) => Number(a.id) - Number(b.id));

  const orderedFresh = typeof opts.freshOrder === "function" ? opts.freshOrder(fresh) : fresh;
  const ordered = [...due, ...orderedFresh].slice(0, count).map((w) => w.id);
  return { ordered, scored: [] };
}

/** 统计一组选中词的指标 */
function statOf(ids, byId, scope, st, now) {
  let inScope = 0;
  let duePicked = 0;
  for (const id of ids) {
    const w = byId.get(id);
    if (w && scope.has(unitKeyOf(w))) inScope += 1;
    const s = st[id];
    if (s && s.lv > 0 && s.due > 0 && s.due <= now) duePicked += 1;
  }
  return { ids, inScope, duePicked, ratio: ids.length ? inScope / ids.length : 0 };
}

/**
 * 算一组对比指标。
 *
 * @returns {{
 *   scopeUnits: string[],
 *   constrained: {ids:number[], inScope:number, duePicked:number, ratio:number},
 *   baseline:    {ids:number[], inScope:number, duePicked:number, ratio:number},
 *   backlog:     {dueTotal:number, constrained:number, baseline:number}
 * }}
 */
export function compareMetrics(words, states = {}, c = {}, budget = {}) {
  const now = Number(c.now) || 0;
  const scope = new Set((c.units || []).map(String));
  const st = states || {};
  const list = words || [];
  const byId = new Map(list.map((w) => [w.id, w]));

  const constrained = schedule(list, st, c, budget);
  const baseline = baselineSchedule(list, st, c, budget);

  // 到期总数：积压 = 到期总数 − 本次做掉的到期词（间隔重复最真实的痛点）
  let dueTotal = 0;
  for (const w of list) {
    if (!w || w.entry_type !== "word") continue;
    const s = st[w.id];
    if (s && s.lv > 0 && s.due > 0 && s.due <= now) dueTotal += 1;
  }

  const A = statOf(constrained.ordered, byId, scope, st, now);
  const B = statOf(baseline.ordered, byId, scope, st, now);
  return {
    scopeUnits: [...scope],
    constrained: A,
    baseline: B,
    backlog: {
      dueTotal,
      constrained: Math.max(0, dueTotal - A.duePicked),
      baseline: Math.max(0, dueTotal - B.duePicked),
    },
  };
}

export default { baselineSchedule, compareMetrics };
