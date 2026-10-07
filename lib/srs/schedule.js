// ============================================================
// lib/srs/schedule.js —— 组卷调度（纯函数层）
// ------------------------------------------------------------
// 词跃 LexiRise
//
// 职责：给定【候选词 + 记忆状态 + 本次考试范围 + 预算】，
//       算出"这次先背谁"的确定顺序。
//
// 三条设计约束（与 lib/srs/model.js 对齐）：
//   ① 纯函数：不碰 localStorage / DOM / 网络；时间只来自 c.now，
//      绝不调用 Date.now() —— 离线重放与对照实验的前提
//   ② 无副作用：不修改传入的 words / states / c / budget
//   ③ 确定性：同分时用 id 升序做 tie-breaker，
//      同一份输入在任何环境下都得到同一个 ordered
//
// 打分公式（四项相加；权重见 DEFAULT_WEIGHTS，可用 W 覆盖）：
//   新词补贴   lv === 0 ? W.newWord : 0
//   范围补贴   在考试范围内 ? W.inScope : W.outScope
//   到期补贴   min(overdue, 14) / 14 * W.overdue     overdue = 已到期天数
//   错误率补贴 errRate * W.errorRate                  errRate = 1 - ok/total
//
// 返回 { ordered, scored }：
//   ordered —— 入选词 id 列表（已按预算 count 与新词配额 newMax 裁剪）
//   scored  —— 全部候选的打分明细（按 score 降序，含落选词），
//              用于回答"这个词为什么排上 / 为什么没排上"
// ============================================================

import { DAY } from "./model.js";
import { unitKeyOf } from "../units.js"; // 单元键的唯一来源（不要在这里另写一份）

/** 到期补贴的天数封顶：超过 14 天不再加分，免得陈年老词永远霸榜 */
const OVERDUE_CAP_DAYS = 14;

/** 默认权重：新词 / 范围内 / 范围外 / 逾期 / 错误率（数值由规格冻结） */
export const DEFAULT_WEIGHTS = { newWord: 0.6, inScope: 1.0, outScope: 0.15, overdue: 0.8, errorRate: 0.7 };

/**
 * 安全取数：缺失 / null / 非数字一律回退到 fallback。
 * 记忆状态可能只有 { lv, due }（历史数据、补建），这里不抛错。
 */
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 可选参数取数：undefined / null / 空串 = 没传 → fallback；
 * 用于 count、newMax 这类"不传就是不限"的参数。
 */
function optionalNum(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * id 升序比较器（同分时的 tie-breaker）。
 * 数字按数值比，其他类型退化成字符串比 —— 目的是任何输入都有确定顺序。
 */
function compareId(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a);
  const sb = String(b);
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

/**
 * 排出一个"先背谁"的顺序。
 *
 * @param {Array<{id:number|string, grade:*, semester:*, unit:*, entry_type?:string}>} words 候选词表
 * @param {Object<string, {lv?:number, due?:number, ok?:number, total?:number}>} states 记忆状态表（可缺项）
 * @param {{now:number, units:string[]}} c 上下文：now = 当前时间戳；units = 本次考试范围
 * @param {{count:number, newMax?:number, dueMin?:number}} budget 预算：
 *        count  = 本次要几个词
 *        newMax = 新词上限（不传 = 不限）
 *        dueMin = **到期词保底个数**（不传 = 不保底）
 * @param {object} [W] 权重覆盖（只需写要改的键，其余取 DEFAULT_WEIGHTS）
 * @returns {{ordered:Array<number|string>, scored:Array<{id:*, score:number, reason:object}>}}
 */
export function schedule(words, states, c, budget, W = DEFAULT_WEIGHTS) {
  const wt = { ...DEFAULT_WEIGHTS, ...(W || {}) };
  const now = num(c && c.now, 0);
  const list = Array.isArray(words) ? words : [];
  const st = states || {};

  // 考试范围：统一转字符串再比，避免 units 里混进数字（7 vs "7"）
  const units = c && Array.isArray(c.units) ? c.units : [];
  const scope = new Set(units.map((u) => String(u)));

  // 预算：count 不传 = 不限；负数按 0；小数向下取整
  const count = Math.max(0, Math.floor(optionalNum(budget && budget.count, Infinity)));
  // 新词配额：newMax 不传 = 不限；0 = 本次一个都不给
  const newMax = Math.max(0, Math.floor(optionalNum(budget && budget.newMax, Infinity)));
  // 到期词保底：不传 = 0（不保底）
  const dueMin = Math.max(0, Math.floor(optionalNum(budget && budget.dueMin, 0)));

  const scored = [];
  for (const w of list) {
    // ① 短语本阶段不参与组卷（入口与显示都还没准备好），按规格跳过
    if (!w || w.entry_type !== "word") continue;
    // ② 没有 id 的词无法回流到页面，直接丢
    if (w.id === undefined || w.id === null) continue;

    const s = st[w.id] || null;
    const lv = num(s && s.lv, 0);
    const due = num(s && s.due, 0);
    const ok = num(s && s.ok, 0);
    const total = num(s && s.total, 0);

    // 范围补贴：考纲内的先背
    const inScope = scope.has(unitKeyOf(w));

    // 到期补贴：只有"排过复习计划"的词（due > 0）才谈得上逾期。
    // 新词从没排过期，逾期按 0 计 —— 否则每个新词都会白拿一份满额逾期补贴
    const overdue = due > 0 ? Math.max(0, (now - due) / DAY) : 0;
    // 距到期天数：负数 = 已超期；从没排过期的词没有这个概念 → null
    const daysToDue = due > 0 ? (due - now) / DAY : null;

    // 错误率补贴：没作答过 = 0；夹到 0–1，脏数据（ok > total）不至于把分数拉成负的
    const errRate = total > 0 ? Math.min(1, Math.max(0, 1 - ok / total)) : 0;

    const score =
      (lv === 0 ? wt.newWord : 0) +
      (inScope ? wt.inScope : wt.outScope) +
      (Math.min(overdue, OVERDUE_CAP_DAYS) / OVERDUE_CAP_DAYS) * wt.overdue +
      errRate * wt.errorRate;

    scored.push({ id: w.id, score, reason: { inScope, lv, overdue, daysToDue, errRate } });
  }

  // 分数高的在前；同分用 id 升序，保证任何环境下顺序都可复现
  scored.sort((a, b) => b.score - a.score || compareId(a.id, b.id));

  const ordered = [];
  const taken = new Set();
  let newUsed = 0;

  // ① 到期词保底。
  //    ⚠️ 没有这一步会有一个隐蔽的长期缺陷：范围外的到期词永远进不了任何一次
  //    "考试范围"，于是一直排不上队，直到彻底忘光 —— 积压只会越滚越大。
  //    保底名额先按"最过期优先"占住，剩下的才按分数竞争。
  if (dueMin > 0) {
    for (const s of scored) {
      if (ordered.length >= dueMin) break;
      if ((s.reason.overdue || 0) <= 0) continue;
      ordered.push(s.id);
      taken.add(s.id);
    }
  }

  // ② 其余按分数补齐；新词配额只约束这一步
  for (const item of scored) {
    if (ordered.length >= count) break;
    if (taken.has(item.id)) continue;
    if (item.reason.lv === 0) {
      if (newUsed >= newMax) continue;
      newUsed += 1;
    }
    ordered.push(item.id);
    taken.add(item.id);
  }

  return { ordered, scored };
}
