// ============================================================
// tests/sim.test.mjs —— 仿真内核的测试
// 用法（在 web/ 目录下）:  node --test "tests/sim.test.mjs"
//
// 这一层最要紧的两条性质是【确定性】与【配对】——
//   前者保证"你跑出来的和我一样"，后者保证"两种调度的差异只能来自调度"。
// 两条都断了的话，报告里的任何数字都不成立，所以这里测得比别处细。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TRUTH,
  TRUTH_VARIANTS,
  recall,
  makeRng,
  drawFor,
  shuffleWith,
  DEFAULT_SCENE,
  WEEKS,
  unitOfWeek,
  poolWords,
  policies,
  simulateStudent,
  runPairedCohort,
  calibrationCurve,
  calibrationError,
  mean,
  sd,
} from "../lib/srs/sim.js";

/** 一个够小、跑得快的合成词库：七上 8 个单元各 8 词 + 七下 16 词（当"范围外"） */
function tinyPool() {
  const words = [];
  let id = 1;
  for (let u = 1; u <= 8; u++) {
    for (let k = 0; k < 8; k++) {
      words.push({ id: id++, word_en: "w" + id, grade: 7, semester: 1, unit: u, entry_type: "word" });
    }
  }
  for (let u = 1; u <= 2; u++) {
    for (let k = 0; k < 8; k++) {
      words.push({ id: id++, word_en: "x" + id, grade: 7, semester: 2, unit: u, entry_type: "word" });
    }
  }
  // 掺一条短语：它必须被 poolWords 过滤掉（短语本阶段不参与组卷）
  words.push({ id: 9999, word_en: "a phrase", grade: 7, semester: 1, unit: 1, entry_type: "phrase" });
  return words;
}

const SMALL = { days: 14, students: 3, budget: { count: 6, newMax: 6, dueMin: 4 } };

test("recall：dt=0 必为 1；S<=0 必为 0；随间隔单调不增", () => {
  assert.equal(recall(2, 0), 1);
  assert.equal(recall(2, -1), 1);
  assert.equal(recall(0, 5), 0);
  assert.equal(recall(-3, 5), 0);
  let prev = 1;
  for (let d = 0; d <= 30; d++) {
    const r = recall(4, d);
    assert.ok(r <= prev + 1e-12, "间隔越长越不可能记得");
    assert.ok(r >= 0 && r <= 1);
    prev = r;
  }
  // 稳定度 S 的定义就是"回忆概率降到 e⁻¹ 所需的间隔"
  assert.ok(Math.abs(recall(4, 4) - Math.exp(-1)) < 1e-12);
});

test("drawFor：同一个 (种子, 天, 词) 永远抽到同一个数，且落在 [0,1)", () => {
  for (const [s, d, i] of [[1, 0, 1], [7, 13, 42], [20261005, 55, 488]]) {
    const a = drawFor(s, d, i);
    const b = drawFor(s, d, i);
    assert.equal(a, b, "同参数必须同结果");
    assert.ok(a >= 0 && a < 1, "必须是 [0,1) 上的均匀数，实际 " + a);
  }
  // 不同词、不同天应该有区别（不是常数）
  const vals = new Set();
  for (let i = 1; i <= 50; i++) vals.add(drawFor(1, 3, i));
  assert.ok(vals.size >= 48, "不同词应抽到不同的数，实际只有 " + vals.size + " 个不同值");
});

test("drawFor：分布大致均匀（10000 次抽样，十等分每箱 700–1300）", () => {
  const bins = new Array(10).fill(0);
  for (let i = 0; i < 10000; i++) bins[Math.floor(drawFor(99, i % 56, i) * 10)] += 1;
  for (const n of bins) assert.ok(n > 700 && n < 1300, "分箱不均：" + bins.join(","));
});

test("shuffleWith：不修改入参，结果元素相同且可复现", () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const frozen = [...src];
  const a = shuffleWith(src, makeRng(1));
  const b = shuffleWith(src, makeRng(1));
  assert.deepEqual(src, frozen, "入参不能被就地打乱");
  assert.deepEqual(a, b, "同一个随机源必须给出同一个排列");
  assert.deepEqual([...a].sort((x, y) => x - y), frozen, "元素不能丢也不能多");
});

test("poolWords：只留指册次的 word，短语与别的年级都挡掉", () => {
  const p = poolWords(tinyPool());
  assert.equal(p.length, 80, "8×8 七上 + 2×8 七下 = 80");
  assert.ok(p.every((w) => w.entry_type === "word"));
  assert.ok(p.every((w) => w.grade === 7));
});

test("unitOfWeek：第 w 周对应第 w+1 单元", () => {
  assert.equal(unitOfWeek(0), "7-1-1");
  assert.equal(unitOfWeek(WEEKS - 1), "7-1-" + WEEKS);
});

test("仿真：同一个种子 + 同一个策略 → 逐字节复现", () => {
  const pool = poolWords(tinyPool());
  const a = simulateStudent(pool, { ...SMALL, policy: "constrained", seed: 4242 });
  const b = simulateStudent(pool, { ...SMALL, policy: "constrained", seed: 4242 });
  assert.equal(JSON.stringify(a), JSON.stringify(b), "同种子必须逐字节相同");
  assert.equal(a.peakDue, b.peakDue);
  assert.equal(a.studied, b.studied);
});

test("仿真：不同种子应当给出不同的学生（不是常数函数）", () => {
  const pool = poolWords(tinyPool());
  const a = simulateStudent(pool, { ...SMALL, policy: "baselineShuffled", seed: 1 });
  const b = simulateStudent(pool, { ...SMALL, policy: "baselineShuffled", seed: 2 });
  assert.notEqual(JSON.stringify(a.series), JSON.stringify(b.series));
});

test("仿真：不修改传入的词表（纯函数约束）", () => {
  const pool = poolWords(tinyPool());
  const before = JSON.stringify(pool);
  simulateStudent(pool, { ...SMALL, policy: "constrained", seed: 5 });
  simulateStudent(pool, { ...SMALL, policy: "baselineShuffled", seed: 5 });
  assert.equal(JSON.stringify(pool), before, "词表不能被就地改动");
});

test("仿真：所有输出都在合法区间内", () => {
  const pool = poolWords(tinyPool());
  const r = simulateStudent(pool, { ...SMALL, policy: "constrained", seed: 7 });
  assert.equal(r.series.length, SMALL.days);
  for (const d of r.series) {
    assert.ok(d.retention >= 0 && d.retention <= 1, "保持率必须在 0–1");
    assert.ok(d.coverage >= 0 && d.coverage <= 1, "覆盖率必须在 0–1");
    assert.ok(d.due >= 0 && Number.isInteger(d.due));
  }
  // 覆盖率单调不减：学过就不会"没学过"
  assert.ok(r.series[SMALL.days - 1].coverage >= r.series[0].coverage);
  assert.ok(r.peakDue >= 0 && r.peakForgotten >= 0 && r.peakForgotten <= pool.length);
  assert.ok(r.studied <= pool.length, "学过的词不可能超过候选池");
  assert.ok(r.mastered <= r.studied);
  // 每周五一次听写
  assert.equal(r.dictations.length, Math.ceil(SMALL.days / 7));
});

test("仿真：只有学习日才推词 —— 第 6、7 天（周末）的曲线不动", () => {
  const pool = poolWords(tinyPool());
  const r = simulateStudent(pool, { ...SMALL, policy: "constrained", seed: 9 });
  for (let d = 0; d < r.series.length; d++) {
    const weekday = d % 7;
    if (weekday === 5 || weekday === 6) {
      const prev = r.series[d - 1];
      assert.equal(r.series[d].coverage, prev.coverage, "周末不学习，覆盖率不应变化");
      assert.ok(r.series[d].retention <= prev.retention + 1e-12, "周末只会忘，不会想起来");
    }
  }
});

test("配对：同一个学生在同一天对同一个词抽到同一个数 → 差异只来自调度", () => {
  // 直接验证 drawFor 的配对性质：两种调度共用 (seed, day, word) 三个键，
  // 所以只要两边都推了同一个词，作答结果必然一致。
  const seed = 20261005;
  for (const id of [3, 17, 40, 88]) {
    assert.equal(drawFor(seed, 10, id), drawFor(seed, 10, id));
  }
  const pool = poolWords(tinyPool());
  const b = simulateStudent(pool, { ...SMALL, policy: "baselineShuffled", seed });
  const c = simulateStudent(pool, { ...SMALL, policy: "constrained", seed });
  assert.equal(b.seed, c.seed);
  // 两者推的词必须真的不同，否则这个"对照"没有对照可言
  assert.notEqual(JSON.stringify(b.dictations), JSON.stringify(c.dictations));
});

test("队列：配对差值的符号与 wins 计数一致", () => {
  const pool = poolWords(tinyPool());
  const cohort = runPairedCohort(pool, { ...SMALL, baseSeed: 777 });
  assert.equal(cohort.perStudent.length, SMALL.students);
  for (const key of ["dictationRetention", "dictationCoverage", "peakForgotten", "peakDue", "mastered"]) {
    const m = cohort.summary[key];
    assert.equal(m.students, SMALL.students);
    assert.equal(m.wins + m.losses <= m.students, true);
    if (m.diff.mean > 0) assert.ok(m.wins > 0, key + " 差值为正却没有一个学生更好");
    if (m.diff.mean < 0) assert.ok(m.losses > 0, key + " 差值为负却没有一个学生更差");
  }
  assert.equal(cohort.baselinePolicy, "baselineShuffled", "默认基线必须是线上口径");
});

test("队列：曲线长度一致，摸板天数与场景对齐", () => {
  const pool = poolWords(tinyPool());
  const cohort = runPairedCohort(pool, { ...SMALL, baseSeed: 31 });
  assert.equal(cohort.series.days.length, SMALL.days);
  assert.equal(cohort.series.baseline.length, SMALL.days);
  assert.equal(cohort.series.constrained.length, SMALL.days);
  assert.ok(cohort.series.dictationDays.length > 0);
  for (const d of cohort.series.dictationDays) assert.equal(d % 7, DEFAULT_SCENE.dictationWeekday);
});

test("校准：分箱的 predicted / actual 就是箱内样本的平均", () => {
  const samples = [
    { r_pred: 0.05, r_actual: 0 },
    { r_pred: 0.05, r_actual: 1 },
    { r_pred: 0.95, r_actual: 1 },
    { r_pred: 0.95, r_actual: 1 },
  ];
  const c = calibrationCurve(samples, 10);
  assert.equal(c.length, 10);
  assert.equal(c[0].n, 2);
  assert.ok(Math.abs(c[0].predicted - 0.05) < 1e-12);
  assert.equal(c[0].actual, 0.5);
  assert.equal(c[9].n, 2);
  assert.equal(c[9].actual, 1);
  // 边界：r_pred = 1 必须落进最后一箱，不能越界
  const edge = calibrationCurve([{ r_pred: 1, r_actual: 1 }], 10);
  assert.equal(edge[9].n, 1);
  assert.equal(edge.reduce((s, b) => s + b.n, 0), 1);
  // 空输入不炸
  assert.equal(calibrationCurve([], 10).every((b) => b.n === 0), true);
  assert.equal(calibrationError(calibrationCurve([], 10)), 0);
});

test("校准：完美校准的误差为 0，系统性过度自信会被量出来", () => {
  const perfect = [];
  for (let i = 0; i < 100; i++) perfect.push({ r_pred: 0.5, r_actual: i < 50 ? 1 : 0 });
  const pc = calibrationCurve(perfect, 10);
  assert.ok(calibrationError(pc) < 1e-12, "预测 50% 实际 50% → 误差应为 0");
  const over = [];
  for (let i = 0; i < 100; i++) over.push({ r_pred: 0.9, r_actual: i < 40 ? 1 : 0 });
  const oc = calibrationCurve(over, 10);
  assert.ok(Math.abs(calibrationError(oc) - 0.5) < 1e-12, "预测 90% 实际 40% → 误差 50%");
});

test("统计小工具：mean / sd 的边界", () => {
  assert.equal(mean([]), 0);
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(sd([]), 0);
  assert.equal(sd([5]), 0, "单样本没有样本标准差");
  assert.ok(Math.abs(sd([2, 4, 4, 4, 5, 5, 7, 9]) - 2.13809) < 1e-4);
});

test("稳健性：三组真值模型都能跑通，且结论方向一致", () => {
  const pool = poolWords(tinyPool());
  const out = [];
  for (const key of ["optimistic", "base", "pessimistic"]) {
    const cohort = runPairedCohort(pool, { ...SMALL, baseSeed: 55, truth: TRUTH_VARIANTS[key] });
    out.push(cohort.summary.dictationCoverage);
  }
  for (const m of out) {
    assert.ok(Number.isFinite(m.diff.mean));
    assert.ok(m.constrained.mean > m.baseline.mean, "三组参数下覆盖率都应更高");
  }
  assert.equal(TRUTH_VARIANTS.base, TRUTH);
});

test("策略表：三种策略都能被 simulateStudent 认出来，未知策略要报错", () => {
  const pool = poolWords(tinyPool());
  for (const policy of Object.keys(policies)) {
    const r = simulateStudent(pool, { ...SMALL, policy, seed: 3 });
    assert.equal(r.policy, policy);
  }
  assert.throws(() => simulateStudent(pool, { ...SMALL, policy: "nope", seed: 3 }), /未知调度策略/);
});

test("策略：两种基线口径给出不同的选择（否则 freshOrder 参数是摆设）", () => {
  const pool = poolWords(tinyPool());
  const a = simulateStudent(pool, { ...SMALL, policy: "baseline", seed: 8 });
  const b = simulateStudent(pool, { ...SMALL, policy: "baselineShuffled", seed: 8 });
  assert.notEqual(JSON.stringify(a.series), JSON.stringify(b.series));
});