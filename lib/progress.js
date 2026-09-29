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

/**
 * 今日模式组题（唯一真源，替代 train/page.jsx 里的 composeDailyDeck）：
 * 到期复习 + 错词 + 新词（补每日目标）。返回固定的四段（都为空数组时表示全部学完）。
 * 首页与训练页都调它：显示的数字 == 实际出题数。
 */
export function composeDailyDeck(words) {
  const m = memory.load();
  const now = Date.now();
  const byId = new Map(words.map((w) => [w.id, w]));
  // 1) 到期复习
  const dueWords = shuffle(
    words.filter((w) => {
      const s = m[w.id];
      return s && s.lv > 0 && s.due <= now;
    })
  );
  const dueIds = new Set(dueWords.map((w) => w.id));
  // 2) 错词（到期词之外，按错误次数从多到少）
  const wrongIds = wrongBook
    .entries()
    .sort((a, b) => (b[1].n || 0) - (a[1].n || 0))
    .map(([id]) => Number(id))
    .filter((id) => !dueIds.has(id));
  const newTake = newRemain();
  const wrongTake = Math.min(wrongIds.length, Math.ceil((dueWords.length + newTake) * 0.5));
  const wrong = wrongIds.slice(0, wrongTake).map((id) => byId.get(id)).filter(Boolean);
  const wrongSet = new Set(wrong.map((w) => w.id));
  // 3) 新词（未学过，且没在到期/错词里）
  const newW = shuffle(
    words.filter(
      (w) => (!m[w.id] || m[w.id].lv === 0) && !dueIds.has(w.id) && !wrongSet.has(w.id)
    )
  ).slice(0, newTake);
  let deckWords = shuffle([...dueWords, ...wrong, ...newW]);
  if (!deckWords.length) deckWords = shuffle(words).slice(0, 10); // 全部学完的兜底
  return {
    deck: deckWords,
    due: dueWords.length,
    wrong: wrong.length,
    fresh: newW.length,
    total: deckWords.length,
  };
}

/** 今日总账（首页快路径用）：今天该背 N 词 = 到期 + 错词 + 新词剩余 */
export function todaySummary(words) {
  const d = composeDailyDeck(words);
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

export default { dueCount, newRemain, composeDailyDeck, todaySummary, toMastery, learnedCount };