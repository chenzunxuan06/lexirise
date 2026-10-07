// ============================================================
// lib/srs/explain.js —— 把调度器的打分翻译成人话（纯函数）
// ------------------------------------------------------------
// 为什么需要它：调度器选出的词如果不说清"为什么是它"，用户只会觉得
// 系统在随机推词。可解释 = 可信任 —— 这也是本作品区别于黑盒推荐的地方。
//
// 硬性质量标准（写每一条解释前先过一遍）：
//   ❌ "这个词很重要"        ✅ "Unit 5 · p.88 · 教材四会词"
//   ❌ "根据算法推荐"        ✅ "你错过 2 次"
//   ❌ "科学安排复习"        ✅ "已到期 5 天"
//   ❌ "智能匹配你的水平"    ✅ "词根 spect-，能带出 4 个同族词"
//
// 解释只能来自四类【可核实】的来源：
//   教材（单元/页码/四会）· 你的历史（作答次数）· 时间（到期/截止）· 结构（词根词缀）
//
// 扩展位：T13–T19 建好课文语料索引后，在 SOURCE_ORDER 里加入 "corpus"，
//         即可显示"课本原句：Be patient with your friends." —— 不需要改结构。
// ============================================================

/**
 * 解释来源。顺序即展示顺序。
 * "corpus" 就是本文件顶部预留的那个扩展位 —— T13–T19 建好语料索引后接上：
 * 调用方把 { 词id: "课本原句" } 放进 ctx.corpus，这里就会多出一条可核实的依据。
 */
import { bookLabel } from "../units.js";

export const SOURCE_ORDER = ["textbook", "corpus", "time", "history", "structure"];

/** 三个分组：告诉学生"哪些必须做、哪些有余力再做" */
export const GROUPS = {
  priority: { key: "priority", emoji: "🔴", label: "优先", hint: "在考试范围内" },
  also: { key: "also", emoji: "🟠", label: "顺带", hint: "不在范围但已到期，不做会忘" },
  bonus: { key: "bonus", emoji: "🟢", label: "加餐", hint: "有余力再做" },
};

/**
 * 分组判定。规则只有两条，好讲也好验证：
 *   在范围内 → 🔴 优先（考试直接相关）
 *   不在范围但已到期 → 🟠 顺带（不做会忘）
 *   其余 → 🟢 加餐
 */
export function groupOf(reason) {
  if (!reason) return "bonus";
  if (reason.inScope) return "priority";
  if ((reason.overdue || 0) > 0) return "also";
  return "bonus";
}

/**
 * 单元标签：7-1-3 → "七上 U3"
 *
 * 册次那半（"七上"）从 lib/units.js 取 —— 出题范围、语料出处、调度解释
 * 都用同一份册次说法，不在这里再写一遍 {7:"七"} 那张表。
 */
export function unitLabel(w) {
  if (!w) return "";
  return `${bookLabel(w.grade, w.semester)} U${w.unit}`;
}

/**
 * 生成一条解释。
 *
 * @param {object} word 词条（words.json 的一项）
 * @param {object|null} state 记忆状态
 * @param {object} reason 调度器给的打分理由
 * @param {object} [ctx] { scopeLabel } 范围的可读说法
 * @returns {{group:string, items:Array<{kind:string,text:string}>}}
 */
export function explain(word, state, reason, ctx = {}) {
  const items = [];
  const r = reason || {};

  // ① 教材：这个词在教材的什么位置 / 是不是这次考试范围
  if (r.inScope) {
    items.push({ kind: "textbook", text: ctx.scopeLabel || "在考试范围内" });
  } else {
    items.push({ kind: "textbook", text: unitLabel(word) + (word && word.page ? ` · ${word.page}` : "") });
  }
  // 四会 / 非四会：教材用 * 前缀标非四会词
  if (word && typeof word.word_en === "string" && word.word_en.startsWith("*")) {
    items.push({ kind: "textbook", text: "教材非四会词（认识即可）" });
  }

  // ①b 课本原句（语料索引）—— "这就是我们课本上那句"
  //    值可以是字符串，也可以是 { text, source }（带出处时用后者）
  if (word && ctx.corpus && ctx.corpus[word.id]) {
    const c = ctx.corpus[word.id];
    items.push({
      kind: "corpus",
      text: typeof c === "string" ? c : String(c.text || ""),
      source: typeof c === "string" ? "" : String(c.source || ""),
    });
  }

  // ② 时间：到期状态
  const overdue = Number(r.overdue) || 0;
  if (overdue > 0) {
    items.push({ kind: "time", text: `已到期 ${Math.floor(overdue)} 天` });
  } else if (typeof r.daysToDue === "number" && r.daysToDue > 0) {
    items.push({ kind: "time", text: `${Math.floor(r.daysToDue)} 天后到期` });
  }

  // ③ 你的历史：作答记录
  if (!state || !state.total) {
    items.push({ kind: "history", text: "还没学过" });
  } else if (state.total > state.ok) {
    items.push({ kind: "history", text: `你错过 ${state.total - state.ok} 次` });
  } else {
    items.push({ kind: "history", text: `已答对 ${state.ok} 次` });
  }

  // ④ 结构：词根词缀线索（可选）
  if (word && word.affix_hint) {
    items.push({ kind: "structure", text: String(word.affix_hint) });
  }

  items.sort((a, b) => SOURCE_ORDER.indexOf(a.kind) - SOURCE_ORDER.indexOf(b.kind));
  return { group: groupOf(r), items };
}

/**
 * 把一组调度结果整理成"按分组渲染"的结构。
 *
 * @param {Array} words 词库
 * @param {Object} states 记忆状态
 * @param {{ordered:number[], scored:Array}} scheduled schedule() 的返回值
 * @param {object} [ctx] { scopeLabel }
 * @returns {{ groups: Array<{key,emoji,label,hint,words:Array}> , total:number }}
 */
export function groupPlan(words, states, scheduled, ctx = {}) {
  const byId = new Map((words || []).map((w) => [w.id, w]));
  const reasonById = new Map((scheduled.scored || []).map((s) => [s.id, s.reason]));

  const buckets = { priority: [], also: [], bonus: [] };
  for (const id of scheduled.ordered || []) {
    const w = byId.get(id);
    if (!w) continue;
    const st = states ? states[id] : null;
    const reason = reasonById.get(id);
    const e = explain(w, st, reason, ctx);
    buckets[e.group].push({ word: w, state: st || null, reason, items: e.items });
  }

  const groups = ["priority", "also", "bonus"]
    .map((k) => ({ ...GROUPS[k], words: buckets[k] }))
    .filter((g) => g.words.length);

  return { groups, total: (scheduled.ordered || []).length };
}

export default { explain, groupPlan, groupOf, unitLabel, GROUPS, SOURCE_ORDER };
