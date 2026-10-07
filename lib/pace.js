// ============================================================
// lib/pace.js —— 学习节奏（每日预算的两档预设）
// ------------------------------------------------------------
// 【为什么有这个东西】
//   研究报告 §3.2.3 报告了对本策略不利的指标：在每日 12 词的刚性预算下，
//   截止约束调度把预算集中投给"本周要考的那一单元"，代价是期末达到
//   lv≥4 的词数归零（普通做法 8.25）。**这不是权重没调好，是取舍。**
//
//   2026-10-07 补测了预算轴（scripts/retention_tradeoff.mjs，12 名学生配对）：
//     每日 12 词 → 期末 lv≥4 = 0.00，12/12 名学生都不如普通做法
//     每日 24 词 → 7.42      每日 30 词 → 19.67（反超普通做法 16.83）
//   也就是说：**要长期保持，门槛在 24–30 词/天**，否则买不到。
//
//   拍板结果（用户 2026-10-07 选定方案甲）：**产品给两档，把选择交给学生**，
//   而不是替他默认一个。这就是本模块。
//
// 【为什么是"预设"而不是"新算法"】
//   产品里本来就有两个旋钮：plan.dailyNew（每日新词目标）与
//   plan.reviewCap（每日复习上限）。本模块**只做预设** ——
//   一键把两个旋钮写成一组搭配，不引入新的存储格式、不碰调度器。
//   想微调照样可以去拧那两个按钮，那时节奏显示为"自定义"。
//
// 【为什么"当前是哪一档"是算出来的，不是存下来的】
//   存一个 pace 键就有两个真源：键说假期、数字还是考前的，谁也发现不了。
//   这里按"数字是否正好等于某档预设"反推，**永远和实际生效的预算一致**。
// ============================================================

import { plan } from "./memory.js";
import { saveReviewCap } from "./progress.js";

/**
 * 两档预设。
 *
 * 数字怎么来的（不是拍的）：
 *  · 考前档 10 / 40 —— 沿用线上现状（plan.dailyNew 默认 10、reviewCap 默认 40），
 *    **这一档一个字都没改**，所以默认用户的体验与之前完全一致。
 *  · 假期档 20 / 60 —— 目标是把每日接触量推过实测门槛（24–30 词/天）：
 *    新词 20 个（接近设置页上限 50 的一半，学生做得到），
 *    再把复习上限从 40 提到 60，让积压能更快清掉。
 *    仿真里的 count 是"每日接触总词数"，产品这边是"新词目标 + 复习上限"两个旋钮，
 *    **两者不是同一个刻度**，所以这里说的是"量级对得上"，不是"等价于 30"。
 *
 * @type {ReadonlyArray<{key:string,label:string,desc:string,dailyNew:number,reviewCap:number}>}
 */
export const PACES = Object.freeze([
  Object.freeze({
    key: "exam",
    label: "考前模式",
    desc: "跟着学校节奏 · 保住下次听写",
    dailyNew: 10,
    reviewCap: 40,
  }),
  Object.freeze({
    key: "holiday",
    label: "假期模式",
    desc: "没有听写压力 · 补长期记忆",
    dailyNew: 20,
    reviewCap: 60,
  }),
]);

/** 题目要求：两档不能长得一样，否则"预设"就是摆设（测试里也断言这一点） */
export const PACE_KEYS = PACES.map((p) => p.key);

/**
 * 由当前生效的两个数字反推节奏。
 *
 * @param {number} dailyNew 每日新词目标
 * @param {number} reviewCap 每日复习上限（0 = 不封顶）
 * @returns {object|null} 命中的预设；都不命中返回 null（= 自定义）
 */
export function paceOf(dailyNew, reviewCap) {
  const n = Number(dailyNew);
  const c = Number(reviewCap);
  return PACES.find((p) => p.dailyNew === n && p.reviewCap === c) || null;
}

/** 节奏的可读名字（给界面用）；认不出来就说"自定义" */
export function paceLabel(dailyNew, reviewCap) {
  const p = paceOf(dailyNew, reviewCap);
  return p ? p.label : "自定义";
}

/** 按 key 取预设；不认识的 key 直接报错，不静默回落到某一档 */
export function getPace(key) {
  const p = PACES.find((x) => x.key === key);
  if (!p) throw new Error("未知的学习节奏：" + key);
  return p;
}

/**
 * 应用一档节奏：把两个旋钮一起写成该档的搭配。
 * @returns {{dailyNew:number, reviewCap:number}} 落库后的实际值
 */
export function applyPace(key) {
  const p = getPace(key);
  plan.setDailyNew(p.dailyNew);
  saveReviewCap(p.reviewCap);
  return { dailyNew: p.dailyNew, reviewCap: p.reviewCap };
}

/** 当前生效的节奏 + 两个数字（界面一次读全，免得三个地方各读一次） */
export function readPace() {
  const p = plan.load() || {};
  const dailyNew = Number(p.dailyNew) || 10;
  const reviewCap = p.reviewCap === 0 ? 0 : Number(p.reviewCap) || 40;
  const hit = paceOf(dailyNew, reviewCap);
  return { key: hit ? hit.key : null, label: hit ? hit.label : "自定义", dailyNew, reviewCap };
}

export default { PACES, PACE_KEYS, paceOf, paceLabel, getPace, applyPace, readPace };
