// ============================================================
// lib/quantity.js —— 「这次背多少」选择记忆（方向C 阶段 2）
// ------------------------------------------------------------
// 规则（v7/v8 已定）：10 / 20 / 30 / 全部 / 自定义，记住上次选择。
// 边界：选项按单元剩余词数裁剪（剩 21 就显示「剩的 21 词」，
//   "全部"永远可用；自定义 1..单元词数）。
// 存取：放 plan（lexirise:plan），随账号同步，不新增 key。
// ============================================================

import { plan } from "./memory";

const Q_KEY = "quantity"; // plan 下的子键：{ unitKey, kind, value }

export function unitKey(grade, semester, unit) {
  return `${grade}-${semester}-${unit}`;
}

/**
 * 算出本单元的选择项
 * @param {{unitWords:number, left:number}} 单元词数与剩余
 * @returns {Array<{kind:'n'|'left'|'all'|'custom', n:number|null, label:string, desc?:string}>}
 */
export function quantityOptions({ unitWords, left }) {
  const opts = [];
  const push = (kind, n, label) => opts.push({ kind, n, label });
  if (unitWords >= 10) push("n", 10, "10 词");
  if (unitWords >= 20) push("n", 20, "20 词");
  if (unitWords >= 30) push("n", 30, "30 词");
  // “剩的 N 词”优先（最推荐）；未学/全留时与“全部”重复则不单列
  const rem = Math.max(0, left);
  if (rem > 0 && rem !== unitWords && !opts.some((o) => o.n === rem)) {
    push("left", rem, `剩的 ${rem} 词`);
  }
  // “全部” = 整单元（已背完时也出现，用于重背）
  if (unitWords > 0 && !opts.some((o) => o.n === unitWords)) {
    push("all", unitWords, `全部 ${unitWords} 词`);
  }
  opts.push({ kind: "custom", n: null, label: "自定义…" });
  return opts;
}

/** 读取本单元上次的选择 */
export function readQuantity(grade, semester, unit) {
  const p = plan.load();
  const q = (p && p[Q_KEY]) || {};
  const k = unitKey(grade, semester, unit);
  return q[k] || null; // null = 未选过
}

/** 保存本单元选择 */
export function saveQuantity(grade, semester, unit, kind, value) {
  const p = plan.load();
  const q = { ...(p[Q_KEY] || {}) };
  q[unitKey(grade, semester, unit)] = { kind, value, at: Date.now() };
  p[Q_KEY] = q;
  plan.save(p);
}

/** 把选择翻译成语义：返回 { count, label }；count 为 null = 全部（label 用于开始按钮，如"剩的 45 词"） */
export function resolveQuantity(sel, { unitWords, left }) {
  if (!sel) return { count: null, label: "" };
  if (sel.kind === "n") return { count: Math.min(sel.value, unitWords), label: `${sel.value} 词` };
  if (sel.kind === "left") {
    const n = Math.min(sel.value, left);
    return { count: n, label: `剩的 ${n} 词` };
  }
  if (sel.kind === "all") return { count: null, label: `全部 ${unitWords} 词` };
  if (sel.kind === "custom") {
    const n = Math.max(1, Math.min(Number(sel.value) || 1, unitWords));
    return { count: n, label: `${n} 词` };
  }
  return { count: null, label: "" };
}

export default { quantityOptions, readQuantity, saveQuantity, resolveQuantity, unitKey };