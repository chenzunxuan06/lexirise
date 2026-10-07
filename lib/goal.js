// ============================================================
// lib/goal.js —— 学习目标（"下周三要听写 Unit 5"）
// ------------------------------------------------------------
// 目标 = 调度器的输入。没有它，复习队列只能按"到期时间"排，
// 就退化成普通间隔重复 App —— 这也是本作品要解决的问题。
//
// 存储位置：lib/memory.js 的 plan（localStorage 键 lexirise:plan）
//   ① plan 已经在 DATA_KEYS 里 → 跟着账号同步，换设备不丢
//   ② 不新建后端表 → 零后端改动
//   （注意：lexirise:settings 不在 DATA_KEYS 里，那里的东西不会同步，别放这儿）
//
// 一个关键设计：**没有目标时也要有可用的范围**。
//   学生不想填、忘了填，系统不能就瘫了。所以提供 inferCurrentUnit()：
//   用学生自己的进度推断"当前在学的单元"。这样：
//     · 目标输入变成"可选的微调"，而不是"必须的前置动作"
//     · 影子模式（lib/srs/shadow.js）不需要任何人填东西就能开始跑
// ============================================================

import { plan, notifyDataChange } from "./memory.js";
import { unitKeyOf } from "./units.js";

/** 目标类型（仅用于展示文案） */
export const GOAL_KINDS = ["dictation", "quiz", "exam"];
export const GOAL_KIND_LABEL = { dictation: "听写", quiz: "单元测验", exam: "考试" };

/**
 * 读取当前目标。
 * @returns {{at:number, kind:string, units:string[], updatedAt:number}|null}
 */
export function readGoal() {
  const g = plan.load().goal;
  if (!g || !Array.isArray(g.units) || !g.units.length) return null;
  return g;
}

/**
 * 写入目标并触发同步推送。
 * @param {{at:number, kind?:string, units:string[]}} goal at = 考试/听写的时间戳
 */
export function saveGoal(goal) {
  const p = plan.load();
  p.goal = { kind: "dictation", ...goal, updatedAt: Date.now() };
  plan.save(p);
  notifyDataChange(); // 订阅者（同步层）据此推送服务器
  return p.goal;
}

/** 清除目标（回到"纯进度推断"模式） */
export function clearGoal() {
  const p = plan.load();
  delete p.goal;
  plan.save(p);
  notifyDataChange();
}

/**
 * 推断"当前在学的单元"：按 (年级, 学期, 单元) 顺序，
 * 找第一个【还有没学过的词】的单元 —— 那就是学生的进度前沿。
 *
 * 纯函数：states 由调用方传入（生产里传 memory.load()）。
 *
 * @param {Array} words 词库
 * @param {Object} states 记忆状态 { [id]: {lv,...} }
 * @returns {string|null} 单元键（如 "7-1-3"）；没有可选单元时返回 null
 */
export function inferCurrentUnit(words, states = {}) {
  const order = []; // 保持出现顺序 = (年级,学期,单元) 升序
  const stat = new Map(); // key -> { total, unlearned }
  for (const w of words || []) {
    if (!w || w.entry_type !== "word") continue; // 短语不参与组卷，也不该影响进度判断
    const k = unitKeyOf(w);
    let s = stat.get(k);
    if (!s) {
      s = { total: 0, unlearned: 0 };
      stat.set(k, s);
      order.push(k);
    }
    s.total += 1;
    const st = states[w.id];
    if (!st || !st.lv) s.unlearned += 1;
  }
  if (!order.length) return null;

  for (const k of order) {
    if (stat.get(k).unlearned > 0) return k; // 第一个没学完的单元
  }
  return order[order.length - 1]; // 全学完了 → 停在最后一个单元
}

/**
 * 实际用于调度的范围。
 *
 * 优先级：显式目标的范围 > 进度推断的当前单元 > 空数组
 * **永远返回数组**，调用方可以直接喂给 schedule()。
 *
 * @returns {string[]}
 */
export function effectiveScope(words, states = {}) {
  const g = readGoal();
  if (g) return g.units;
  const k = inferCurrentUnit(words, states);
  return k ? [k] : [];
}

/**
 * 供界面展示的一句话范围说明（可解释性用）。
 * @returns {{units:string[], label:string, inferred:boolean}}
 */
export function describeScope(words, states = {}) {
  const g = readGoal();
  if (g) {
    const label = g.units.length === 1 ? g.units[0] : `${g.units.length} 个单元`;
    return { units: g.units, label: `${GOAL_KIND_LABEL[g.kind] || "考试"}范围 · ${label}`, inferred: false };
  }
  const k = inferCurrentUnit(words, states);
  return { units: k ? [k] : [], label: k ? `当前进度 · ${k}` : "未设置范围", inferred: true };
}

export default { readGoal, saveGoal, clearGoal, inferCurrentUnit, effectiveScope, describeScope, GOAL_KIND_LABEL };
