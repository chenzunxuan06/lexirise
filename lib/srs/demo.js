// ============================================================
// lib/srs/demo.js —— 演示用的学生状态（不是真实用户数据！）
// ------------------------------------------------------------
// 【为什么需要它】
//   对比视图要展示"约束调度 vs 按到期排序"的差别。但空账号下两者看不出差别：
//   词表按单元排序，"按 id 取前 20 个" 恰好就是 Unit 1 —— 而 Unit 1 往往正是
//   当前范围，于是两种调度**都**选出了范围内的词，对比反而误导。
//   真实学生的状态是"学过好几个单元、到期词散落各处"，那时差别才显现。
//
// 【诚实底线】
//   这里造的是【演示数据】，绝不能说成真实用户数据。
//   调用方（app/compare/page.jsx 的 ?demo=1）必须在界面上明示。
//   它只存在于内存里，不写 localStorage，不污染任何真实数据。
//
// 【确定性】
//   不用随机数，用 id 的确定散列 —— 同样的词表永远得到同样的演示状态，
//   这样截图、答辩演示、回归对比都可复现。
// ============================================================

const DAY = 86400000;

/** 把整数确定地散列到 [0,1)。不用 Math.random，保证可复现。 */
function hash01(n) {
  let x = Math.imul((Number(n) || 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * 造一个"七年级上、学到 Unit 3"的学生状态。
 *   Unit 1–2：学过，熟练度 2–6，其中约 3/4 已到期（散落在范围外）
 *   Unit 3  ：一半学过、一半没学（正是当前范围）
 *   其余册次：没学过
 *
 * @param {Array} words 词库
 * @param {number} now 当前时间戳
 * @returns {{[id:number]: object}} 记忆状态表
 */
export function demoStates(words, now) {
  const states = {};
  const t = Number(now) || 0;

  for (const w of words || []) {
    if (!w || w.entry_type !== "word") continue;
    if (Number(w.grade) !== 7 || Number(w.semester) !== 1) continue;
    const unit = Number(w.unit);
    const h = hash01(w.id);

    if (unit <= 2) {
      const lv = 2 + Math.floor(h * 5); // 2–6
      const overdueDays = h < 0.75 ? 1 + h * 10 : -(1 + h * 3); // 正=已过期，负=未到期
      states[w.id] = {
        lv,
        ok: lv + 1,
        total: lv + 2,
        lapses: h < 0.3 ? 1 : 0,
        last: t - (lv + 3) * DAY,
        due: t - overdueDays * DAY,
        first: t - 20 * DAY,
      };
    } else if (unit === 3 && h < 0.5) {
      const lv = 1 + Math.floor(h * 6); // 1–3
      states[w.id] = {
        lv,
        ok: lv,
        total: lv + 1,
        lapses: 0,
        last: t - 2 * DAY,
        due: t + DAY,
        first: t - 5 * DAY,
      };
    }
  }
  return states;
}

export default { demoStates };
