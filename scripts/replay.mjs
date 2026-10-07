// ============================================================
// scripts/replay.mjs —— 回放器 / 仿真对照（T27）
// ------------------------------------------------------------
// 词跃 LexiRise
//
// 它回答的是作品的核心问题，也是唯一一个"没有真实用户也能做"的对照实验：
//
//   「同一批学生、同一串随机数、同一个每日预算，只把调度器换掉，
//     一学期下来听写当天的保持率 / 覆盖率 / 到期积压会差多少？」
//
// 用法：
//   node scripts/replay.mjs                 # 三种每日预算各跑一遍，写入 public/sim-report.json
//   node scripts/replay.mjs --students 24   # 加大样本
//   node scripts/replay.mjs --quiet         # 只写文件不打印表
//
// ⚠️ 纪律：这是【仿真】。写进参赛材料时必须带前缀，不能写成"实验证明"。
//    见 lib/srs/sim.js 顶部关于"为什么仿真学生不用产品自己的模型"的说明。
// ============================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TRUTH,
  TRUTH_VARIANTS,
  DEFAULT_SCENE,
  WEEKS,
  TERM,
  POOL_TERMS,
  unitOfWeek,
  poolWords,
  runPairedCohort,
  calibrationCurve,
  calibrationError,
  POLICY_LABEL,
} from "../lib/srs/sim.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);

// ------------------------------------------------------------
// 参数
// ------------------------------------------------------------
function argOf(name, fallback) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

const STUDENTS = Number(argOf("students", 12)) || 12;
const SEED = Number(argOf("seed", 20261005)) || 20261005;
const OUT = String(argOf("out", ROOT + "/public/sim-report.json"));
const QUIET = process.argv.includes("--quiet");

/**
 * 三个每日预算。为什么是这三个：
 *   6  —— 预算严重不足，"复习还是学新词"必须二选一，调度差异最尖锐
 *   12 —— 每天 10 分钟的真实量级，主场景
 *   20 —— 预算有余，用来做"反例检验"：如果差异在这里消失，
 *         就说明词跃的收益来自"约束下的取舍"，而不是来自算法本身更聪明
 */
const SCENES = [
  { name: "每天 6 词（预算紧张）", budget: { count: 6, newMax: 6, dueMin: 4 } },
  { name: "每天 12 词（每天 10 分钟）", budget: { count: 12, newMax: 12, dueMin: 6 } },
  { name: "每天 20 词（预算有余）", budget: { count: 20, newMax: 20, dueMin: 6 } },
];

/** 主场景：作报告标题、校准曲线与稳健性检验都用它 */
const PRIMARY = 1;

/**
 * 稳健性检验：只换"仿真学生有多强"，不换调度器。
 * 如果结论只在某一组参数下成立，那它就是调参调出来的 —— 这一节就是为了
 * 让评委可以自己判断"是不是你挑了一组对自己有利的参数"。
 */
const ROBUSTNESS = [
  { key: "optimistic", name: "乐观（底子好：初见认识率 55%）" },
  { key: "base", name: "基准（初见认识率 35%）" },
  { key: "pessimistic", name: "悲观（底子弱：初见认识率 15%）" },
];

/**
 * 基线口径的敏感性：仿真默认用"新词打乱"（与线上 lib/progress.js 一致）。
 * 但 T12 对比视图用的是"新词按词表顺序"。两者对结论影响很大，所以两个都报 ——
 * 如果只在某一种口径下成立，读者有权知道。
 */
const BASELINE_VARIANTS = [
  { key: "baselineShuffled", name: "新词打乱（与线上一致）★仿真默认" },
  { key: "baseline", name: "新词按词表顺序（T12 口径）" },
];

// ------------------------------------------------------------
// 词库
// ------------------------------------------------------------
const raw = JSON.parse(readFileSync(ROOT + "/public/words.json", "utf8"));
const pool = poolWords(raw.words);
const poolUnitCount = new Set(pool.map((w) => unitKeyOfLite(w))).size;
function unitKeyOfLite(w) {
  return w.grade + "-" + w.semester + "-" + w.unit;
}

if (!pool.length) {
  console.error("候选池为空 —— 检查 public/words.json 的 grade/semester 字段");
  process.exit(1);
}

// ------------------------------------------------------------
// 跑
// ------------------------------------------------------------
const t0 = Date.now();
const scenes = [];

/** 把一次队列跑成报告要的形状 */
function runOne(s, extra = {}) {
  const cohort = runPairedCohort(pool, {
    students: STUDENTS,
    baseSeed: SEED,
    days: DEFAULT_SCENE.days,
    studyWeekdays: DEFAULT_SCENE.studyWeekdays,
    dictationWeekday: DEFAULT_SCENE.dictationWeekday,
    budget: s.budget,
    t0: DEFAULT_SCENE.t0,
    ...extra,
  });
  const curve = calibrationCurve(cohort.calibration, 10);
  return {
    name: s.name,
    budget: s.budget,
    students: cohort.students,
    summary: cohort.summary,
    series: {
      days: cohort.series.days,
      scope: cohort.series.scope,
      dictationDays: cohort.series.dictationDays,
      baseline: cohort.series.baseline,
      constrained: cohort.series.constrained,
    },
    calibration: { bins: curve, error: calibrationError(curve), n: cohort.calibration.length },
    blindSpot: cohort.blindSpot,
  };
}

for (const s of SCENES) {
  scenes.push(runOne(s));
  if (!QUIET) process.stderr.write("· " + s.name + " 跑完\n");
}

// 稳健性：同一套参数、只换仿真学生的真值模型
const robustness = [];
for (const r of ROBUSTNESS) {
  const one = runOne(SCENES[PRIMARY], { truth: TRUTH_VARIANTS[r.key] });
  robustness.push({
    key: r.key,
    name: r.name,
    truth: TRUTH_VARIANTS[r.key],
    summary: one.summary,
  });
  if (!QUIET) process.stderr.write("· 稳健性 " + r.name + " 跑完\n");
}

// 基线口径敏感性：主场景跑两遍，只换基线
const baselines = [];
for (const b of BASELINE_VARIANTS) {
  const one = runOne(SCENES[PRIMARY], { baselinePolicy: b.key });
  baselines.push({ key: b.key, name: b.name, summary: one.summary });
  if (!QUIET) process.stderr.write("· 基线口径 " + b.name + " 跑完\n");
}

const elapsedMs = Date.now() - t0;

// ------------------------------------------------------------
// 报告
// ------------------------------------------------------------
const report = {
  kind: "simulation", // ⚠️ 前端据此显示"仿真"标识，不要改
  generatedAt: new Date().toISOString(),
  elapsedMs,
  reproducible: {
    command:
      "node scripts/replay.mjs --students " + STUDENTS + " --seed " + SEED,
    students: STUDENTS,
    seed: SEED,
  },
  scene: {
    term: TERM,
    weeks: WEEKS,
    units: Array.from({ length: WEEKS }, (_, i) => unitOfWeek(i)),
    days: DEFAULT_SCENE.days,
    studyWeekdays: DEFAULT_SCENE.studyWeekdays,
    dictationWeekday: DEFAULT_SCENE.dictationWeekday,
    story: "一个七年级学生，一周学一个单元、每周五听写本周单元，只在周一到周五学习",
  },
  pool: { terms: POOL_TERMS, words: pool.length, units: poolUnitCount },
  model: {
    note: "仿真学生的记忆模型与产品自身的 lv/间隔表【不是】同一个模型，避免循环论证",
    truth: TRUTH,
    product: "R = exp(−Δ / S(lv))，S 取 lv 对应的间隔表值；到期那一刻恒为 e⁻¹ ≈ 36.8%",
  },
  policyLabel: POLICY_LABEL,
  primary: PRIMARY,
  baselineDefault: "baselineShuffled",
  scenes,
  robustness,
  baselines,
};

// 指纹：把"会随版本变的东西"排除掉再算，便于别人核对"你跑出来的和我一样吗"
const digest = createHash("sha256")
  .update(JSON.stringify(scenes.map((s) => ({ name: s.name, budget: s.budget, summary: s.summary }))))
  .digest("hex")
  .slice(0, 16);
report.digest = digest;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 1));
if (!QUIET) process.stderr.write("· 写入 " + OUT + "（" + elapsedMs + "ms）\n");

// ------------------------------------------------------------
// 表格
// ------------------------------------------------------------
function pct(x) {
  return (x * 100).toFixed(1) + "%";
}
function fixed(x, n = 1) {
  return Number(x).toFixed(n);
}

if (!QUIET) {
  const lines = [];
  lines.push("");
  lines.push("仿真对照报告（不是真实实验）");
  lines.push("场景：" + report.scene.story);
  lines.push(
    "候选池：" + pool.length + " 词 / " + poolUnitCount + " 个单元　·　学生 " + STUDENTS + " 人（配对设计）　·　种子 " + SEED
  );
  lines.push("");
  lines.push(
    ["每日预算", "指标", "普通做法", "词跃", "配对差值", "谁更好"].join("\t")
  );
  lines.push("-".repeat(96));

  for (const s of scenes) {
    const rows = [
      ["听写当天·范围内保持率", "dictationRetention", (v) => pct(v)],
      ["听写当天·范围内覆盖率", "dictationCoverage", (v) => pct(v)],
      ["欠账峰值（真值口径·词）", "peakForgotten", (v) => fixed(v)],
      ["到期积压峰值（产品口径·词）", "peakDue", (v) => fixed(v)],
      ["期末已掌握 lv≥4（词）", "mastered", (v) => fixed(v)],
    ];
    for (const [label, key, fmt] of rows) {
      const m = s.summary[key];
      const wins = m.wins + "/" + m.students;
      lines.push(
        [
          s.name,
          label,
          fmt(m.baseline.mean) + " ± " + fmt(m.baseline.sd),
          fmt(m.constrained.mean) + " ± " + fmt(m.constrained.sd),
          (m.diff.mean >= 0 ? "+" : "") + fmt(m.diff.mean),
          wins,
        ].join("\t")
      );
    }
    lines.push("");
  }

  const primary = scenes[PRIMARY] || scenes[0];
  const bs = primary.blindSpot;
  lines.push(
    "校准曲线（主场景 · 只统计 lv>0 的作答，共 " +
      primary.calibration.n +
      " 个样本，加权误差 " +
      pct(primary.calibration.error) +
      "）"
  );
  lines.push(["预测区间", "样本", "平均预测", "实际正确率", "偏差"].join("\t"));
  for (const b of primary.calibration.bins) {
    if (!b.n) continue;
    lines.push(
      [
        pct(b.lo) + "–" + pct(b.hi),
        String(b.n),
        pct(b.predicted),
        pct(b.actual),
        (b.predicted - b.actual >= 0 ? "+" : "") + pct(b.predicted - b.actual),
      ].join("\t")
    );
  }
  lines.push("稳健性检验（主场景，" + primary.name + "，只换仿真学生有多强）");
  lines.push(["参数组", "保持率 普通→词跃", "覆盖率 普通→词跃", "欠账峰值 普通→词跃", "谁更好"].join("\t"));
  for (const r of robustness) {
    const a = r.summary.dictationRetention;
    const b = r.summary.dictationCoverage;
    const c = r.summary.peakForgotten;
    lines.push(
      [
        r.name,
        pct(a.baseline.mean) + " → " + pct(a.constrained.mean),
        pct(b.baseline.mean) + " → " + pct(b.constrained.mean),
        fixed(c.baseline.mean) + " → " + fixed(c.constrained.mean),
        a.wins + "/" + a.students,
      ].join("\t")
    );
  }
  lines.push("基线口径敏感性（主场景，只换基线怎么选新词）");
  lines.push(["基线口径", "保持率 普通→词跃", "覆盖率 普通→词跃", "欠账峰值 普通→词跃"].join("\t"));
  for (const b of baselines) {
    const a = b.summary.dictationRetention;
    const c2 = b.summary.dictationCoverage;
    const d = b.summary.peakForgotten;
    lines.push(
      [
        b.name,
        pct(a.baseline.mean) + " → " + pct(a.constrained.mean),
        pct(c2.baseline.mean) + " → " + pct(c2.constrained.mean),
        fixed(d.baseline.mean) + " → " + fixed(d.constrained.mean),
      ].join("\t")
    );
  }
  lines.push("");
  lines.push(
    "模型盲区（lv=0 但此前学过）：" +
      bs.n +
      " 次重复接触，实际答对 " +
      pct(bs.rate) +
      " —— 而模型给出的预测是 0%（把它当成从没见过）"
  );
  lines.push("");
  lines.push("指纹 digest = " + digest + "（同一命令应得到同一个值）");
  lines.push("");
  console.log(lines.join("\n"));
}
