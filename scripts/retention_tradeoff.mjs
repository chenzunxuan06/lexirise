// ============================================================
// scripts/retention_tradeoff.mjs —— 「长期保持」这个目标，代价是多少？
// ------------------------------------------------------------
// 背景：研究报告 3.2.3 报告了对本策略不利的指标 ——
//   期末达到 lv≥4 的词数：普通做法 8.25 / 词跃 0.00。
//   机制已查清：截止约束调度把 480 次接触压在 109 个词上（每个词 4.4 次），
//   但接触集中在该词所属的那一周，而真值模型里稳定度增长很慢 ——
//   在词到期之前反复测它，推不上更高的等级。**在每日 12 词的刚性预算下，
//   "听写日表现"与"长期保持"互相挤占。**
//
// 报告当时只扫了"范围外权重"一个旋钮（0.15→0.8，四个档全是 lv≥4 = 0），
// 于是留下一句"必须提高每日预算，或把长期保持写进打分函数" —— **但没量过预算轴**。
// 这个脚本就是补上那一格：把每日预算从 12 扫到 30，看长期保持的收益
// 与每日负担的代价各是多少。**决策要的是这条曲线，不是"不可兼得"四个字。**
//
// 用法（在 web/ 目录下）：
//     node scripts/retention_tradeoff.mjs            # 12 名学生（与报告同规模）
//     node scripts/retention_tradeoff.mjs 24         # 24 名
//
// 注意：这里**不改任何产品代码**，只调用 lib/srs/sim.js 里已经上线的那套
// 仿真内核（同一个真值模型、同一个默认场景、同一串随机数）。
// ============================================================
import { readFileSync } from "node:fs";
import { runPairedCohort, poolWords, DEFAULT_SCENE } from "../lib/srs/sim.js";

const students = Number(process.argv[2]) || 12;
const words = JSON.parse(readFileSync(new URL("../public/words.json", import.meta.url), "utf8")).words;
const pool = poolWords(words);

const pct = (x) => (x * 100).toFixed(1) + "%";
const f2 = (x) => x.toFixed(2);
const pad = (s, n) => String(s).padEnd(n, " ");

console.log("配对仿真：" + students + " 名学生 · 每人两种调度 · 同一串随机数");
console.log("场景：一周一个单元 · 每周五听写本周单元 · 只在周一至周五学习（沿用 DEFAULT_SCENE）");
console.log("候选池：" + pool.length + " 词（七上 + 七下）");
console.log("");

const BUDGETS = [12, 16, 20, 24, 30];
const rows = [];
for (const count of BUDGETS) {
  const budget = { ...DEFAULT_SCENE.budget, count };
  const r = runPairedCohort(pool, { students, budget });
  const s = r.summary;
  rows.push({
    count,
    retC: s.dictationRetention.constrained.mean,
    retB: s.dictationRetention.baseline.mean,
    covC: s.dictationCoverage.constrained.mean,
    covB: s.dictationCoverage.baseline.mean,
    masteredC: s.mastered.constrained.mean,
    masteredB: s.mastered.baseline.mean,
    forgottenC: s.peakForgotten.constrained.mean,
    forgottenB: s.peakForgotten.baseline.mean,
    winsMastered: s.mastered.wins,
    lossesMastered: s.mastered.losses,
  });
  console.log("  跑完预算 = " + count);
}

console.log("");
console.log("一、词跃（截止约束调度）—— 每日预算扫描");
console.log("  " + pad("每日预算", 10) + pad("听写日保持率", 14) + pad("听写日覆盖率", 14) + pad("期末 lv≥4", 12) + pad("真实遗忘峰值", 14));
for (const r of rows) {
  console.log("  " + pad(r.count + " 词", 10) + pad(pct(r.retC), 14) + pad(pct(r.covC), 14) + pad(f2(r.masteredC), 12) + pad(f2(r.forgottenC), 14));
}

console.log("");
console.log("二、同一预算下的普通做法（按到期排序 + 新词打乱，与线上一致）");
console.log("  " + pad("每日预算", 10) + pad("听写日保持率", 14) + pad("听写日覆盖率", 14) + pad("期末 lv≥4", 12) + pad("真实遗忘峰值", 14));
for (const r of rows) {
  console.log("  " + pad(r.count + " 词", 10) + pad(pct(r.retB), 14) + pad(pct(r.covB), 14) + pad(f2(r.masteredB), 12) + pad(f2(r.forgottenB), 14));
}

console.log("");
console.log("三、相对现状（预算 12）的增量 —— 决策要的是这一列");
const base = rows[0];
for (const r of rows) {
  if (r.count === base.count) continue;
  const dRet = (r.retC - base.retC) * 100;
  const dCov = (r.covC - base.covC) * 100;
  const dMas = r.masteredC - base.masteredC;
  console.log("  预算 " + pad(base.count + " → " + r.count, 12)
    + " 每日负担 +" + pct(r.count / base.count - 1).replace("%", "%")
    + " · 听写日保持率 " + (dRet >= 0 ? "+" : "") + dRet.toFixed(1) + " 个百分点"
    + " · 覆盖率 " + (dCov >= 0 ? "+" : "") + dCov.toFixed(1) + " 个百分点"
    + " · 期末 lv≥4 " + (dMas >= 0 ? "+" : "") + f2(dMas) + " 词");
}

console.log("");
console.log("四、配对结论（词跃 vs 普通做法，同一预算）—— 期末 lv≥4");
for (const r of rows) {
  console.log("  预算 " + pad(r.count, 4) + "：词跃更好的学生 " + r.winsMastered + " / " + students
    + " · 更差的 " + r.lossesMastered + " / " + students);
}
console.log("");
console.log("（读法：这一列如果长期是「词跃更差的学生数 = 全部」，说明长期保持确实是被牺牲的那一项；");
console.log("  如果某个预算之后两边打平，说明那个预算才是「长期保持不再被牺牲」的门槛。）");
