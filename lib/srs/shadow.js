// ============================================================
// lib/srs/shadow.js —— 影子模式：新调度"只算不用"
// ------------------------------------------------------------
// 目的：在【零风险】的前提下，让新调度器（截止约束排序）与现行调度
//      （按到期时间排序）并行跑，把两者的选择都记进日志。
//
// 为什么不直接切换：调度是学生每天看到的东西，改错了他就不用了。
// 影子模式让新调度先积累几周平行数据，用真实日志比对之后，再决定是否切换
// （切换开关在 A6，计划加 settings.scheduler）。
//
// 三条纪律：
//   ① **绝不改变返回值** —— 调用方拿到的东西与没有影子模式时完全一致
//   ② 日志失败静默 —— 走 analytics 的独立通道，坏不了学习流程
//   ③ 有节流 —— todaySummary 会被多处调用（首页/书壳/目录页/训练页），
//      不节流就是每次渲染记一条
// ============================================================

import { schedule } from "./schedule.js";
import { track } from "../analytics.js";
import { effectiveScope } from "../goal.js";

/** 同一页面会话内最多多久记一次（毫秒）。刷新页面会重置。 */
const MIN_INTERVAL_MS = 30 * 60 * 1000;

/** 记进日志的 id 条数上限（日志是给人看的，不需要全量） */
const LOG_LIMIT = 50;

/** 默认预算：与首页"今天"的量级一致 */
export const DEFAULT_BUDGET = { count: 20, newMax: 5, dueMin: 6 };

let lastAt = 0;

/** 仅供测试使用：重置节流状态 */
export function __resetThrottle() {
  lastAt = 0;
}

/**
 * 计算影子调度并记一条日志。**返回值不参与任何渲染。**
 *
 * @param {Array} words 词库
 * @param {Object} states 记忆状态表
 * @param {Object} [opts]
 * @param {number} [opts.now] 时间戳（测试用；缺省 Date.now()）
 * @param {number[]} [opts.realIds] 现行调度实际选中的词 id（用于对比）
 * @param {object} [opts.budget] 预算
 * @param {boolean} [opts.force] 跳过节流（测试用）
 * @returns {object|null} 影子调度结果；被节流跳过时返回 null
 */
export function recordShadow(words, states, opts = {}) {
  // ⚠️ 必须在节流【之前】拦掉空词表。
  // 首页的 words 是异步加载的：todaySummary 会先被空数组调用一次。
  // 那次调用既产生一条毫无意义的空日志，又会白白吃掉 30 分钟的节流额度，
  // 导致词表真正加载后的那次（有价值的那次）被跳过。
  // —— 这个坑是端到端跑真浏览器才暴露出来的，单测当时是绿的。
  if (!Array.isArray(words) || !words.length) return null;

  const now = opts.now === undefined ? Date.now() : opts.now;
  if (!opts.force && now - lastAt < MIN_INTERVAL_MS) return null;
  lastAt = now;

  const units = effectiveScope(words, states);
  const budget = opts.budget || DEFAULT_BUDGET;
  const shadow = schedule(words, states || {}, { now, units }, budget);

  // ⚠️ 事件名 "shadow_schedule" 必须同时登记在 app/api/events/route.js 的 ALLOWED 白名单里
  track("shadow_schedule", {
    units,
    shadow: shadow.ordered.slice(0, LOG_LIMIT),
    real: (opts.realIds || []).slice(0, LOG_LIMIT),
    budget,
  });

  return shadow;
}
