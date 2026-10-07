// ============================================================
// lib/srs/sim.js —— 仿真学生 + 两种调度的对照实验（纯函数层）
// ------------------------------------------------------------
// 词跃 LexiRise
//
// 用途：回答作品的那个核心问题 ——
//   「在"本周讲 Unit 5、下周三听写、每天 10 分钟"的真实约束下，
//     截止约束调度 相比 纯到期排序，把听写范围内词的保持率提到多少、
//     把到期积压峰值降到多少？」
//
// ⚠️ 这是【仿真】，不是真实实验。任何写进材料的数字都必须带这个前缀。
//    被追问时的诚实答法：仿真先证明"两种调度会推出不同的词，并因此产生
//    可测量的差异"；真实实验再证明这件事在人身上成立。仿真替代不了后者。
//
// 【为什么仿真学生不用产品自己的 lv/INTERVALS 模型】
//    如果用了，就是循环论证：调度器按"lv=3 → 4 天后到期"排，仿真学生也
//    按同一张表遗忘 —— 那么"到期那天正好剩 36.8%"是恒等式，不是发现。
//    所以这里的仿真学生用【另一个模型】：
//       稳定度 S（天）连续变化：答对 S ← S×1.9，答错 S ← S×0.55
//       回忆概率 R = exp(−Δt / S)
//    两者只在"隔得越久越容易忘"这一点上一致，具体数值完全不同。
//    于是"产品对记忆的信念"（model.js 的 retrievability）与"仿真学生的真实
//    保持率"（本模块的 R_true）可以放进同一条校准曲线对比 —— 那正是 T26。
//
// 三条设计约束（与 model.js / schedule.js 对齐）：
//   ① 纯函数：不碰 localStorage / DOM / 网络；时间只来自场景参数，
//      绝不调用 Date.now()
//   ② 无副作用：不改动传入的 words；states 在本模块内部复制后自用
//   ③ 确定性：同一个 seed → 逐字节相同的结果（这是"可复现"的底线）
// ============================================================

import { DAY, nextState, retrievability } from "./model.js";
import { schedule } from "./schedule.js";
import { baselineSchedule } from "./compare.js";
import { unitKeyOf } from "../units.js";

// ------------------------------------------------------------
// 一、仿真学生的记忆模型（真值层，调度器看不见）
// ------------------------------------------------------------

/**
 * 真值模型参数。
 *
 * 【第一版参数是错的，这里是修正后的，过程值得写进材料】
 *   最初设 S0 = 0.7、SHRINK = 0.55、S_MIN = 0.15，结果仿真跑出"一个学生
 *   56 天只学了 8 个词"这种荒谬数字。查下来是一个**吸收态**：单词答错后
 *   稳定度跌到 0.385 天，隔一天回忆概率只有 7%，于是又答错、再跌 ——
 *   一旦跌进这个坑就永远出不来，而调度器（正确地）会一直优先推它，
 *   于是它永久占用预算。真实学生不会这样：**你昨天被展示过这个单词，
 *   今天至少还有三四成印象。**
 *   三处修正：① 第一次学过后的稳定度不再由 S0 乘出来，而是直接给
 *   "答对 1.5 天 / 答错 0.9 天"（一天后约 51% / 33%）
 *   ② 稳定度下限抬到 0.55 天（一天后仍有 16%，坑变浅，出得来）
 *   ③ 答错倍率从 0.55 放宽到 0.6
 *
 * ⚠️ 这些是**建模假设**，不是文献值。所以 scripts/replay.mjs 必须同时跑
 *    稳健性检验（TRUTH_VARIANTS）：如果结论只在基准参数下成立，那就是调参
 *    调出来的，不能写进材料。
 */
export const TRUTH = Object.freeze({
  P_FIRST: 0.35, // 从没见过这个词时"认识"的先验概率（初中生已有词汇量）
  S_OK1: 1.6, // 第一次接触就答对之后的稳定度（天）
  S_FAIL1: 0.95, // 第一次接触没答对之后的稳定度（天）
  GROW: 1.9, // 之后每次答对的稳定度倍率
  SHRINK: 0.55, // 之后每次答错的稳定度倍率
  S_MIN: 0.8, // 稳定度下限（≈ 一天后仍有 29% 印象，坑浅到出得来）
  S_MAX: 240, // 稳定度上限（约 8 个月）
});

/**
 * 稳健性检验用的备选真值模型。
 * 只改"学生底子"（P_FIRST）与"学得有多快"（GROW）——
 * 这两个是决定结论方向最敏感的参数。
 */
export const TRUTH_VARIANTS = Object.freeze({
  base: TRUTH,
  optimistic: Object.freeze({ ...TRUTH, P_FIRST: 0.55, GROW: 2.1 }),
  pessimistic: Object.freeze({ ...TRUTH, P_FIRST: 0.15, GROW: 1.7 }),
});

/**
 * 真实回忆概率：稳定度 S 的词，隔了 dtDays 天还记得的概率。
 * @param {number} S 稳定度（天）
 * @param {number} dtDays 距上次接触的天数
 * @returns {number} 0–1
 */
export function recall(S, dtDays) {
  if (!(S > 0)) return 0;
  if (dtDays <= 0) return 1;
  return Math.exp(-dtDays / S);
}

function clampS(v, T) {
  return Math.min(T.S_MAX, Math.max(T.S_MIN, v));
}

// ------------------------------------------------------------
// 二、确定性伪随机（mulberry32）
// 与 tests/_sim.mjs 同一个算法 —— 不共用模块是因为那个在 tests/ 下，
// 产品代码不应反向依赖测试目录。算法本体只有 6 行。
// ------------------------------------------------------------

/**
 * @param {number} seed 任意整数种子
 * @returns {() => number} 均匀分布 [0,1)
 */
export function makeRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates，用给定的确定性随机源（不修改入参） */
export function shuffleWith(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 逐次作答的确定性抽样：把 (学生种子, 第几天, 词 id) 哈希成一个 [0,1) 的数。
 *
 * 【为什么不用一条顺序随机流】
 *   配对设计的理想是：**同一个学生在同一天、对同一个词，两种调度下抽到同一个数**。
 *   如果两种调度共用一条顺序流，那么它们每天抽到的词不同 → 消费的随机数个数
 *   不同 → 后面整条流错位，"配对"就名存实亡了（差异里混进了随机噪声）。
 *   改成按 (种子, 天, 词) 取数之后，只要两边都在同一天抽到了同一个词，
 *   抽到的数就必然相同 —— 差异只剩"选了哪些词"。
 */
export function drawFor(seed, day, id) {
  let h = (0x811c9dc5 ^ (seed | 0)) | 0;
  h = Math.imul(h ^ (day | 0), 0x01000193);
  h = Math.imul(h ^ (Number(id) | 0), 0x01000193);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x9e3779b1);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------
// 三、场景（教学进度 + 预算）
// ------------------------------------------------------------

/** 一学期的教学周数 = 教材单元数（一周一个单元） */
export const WEEKS = 8;

/** 一个学期覆盖的册次（七年级上册） */
export const TERM = { grade: 7, semester: 1 };

/** 候选池 = 该学生"有可能被推到的词"。七年级学生的池子 = 七上 + 七下 */
export const POOL_TERMS = [
  { grade: 7, semester: 1 },
  { grade: 7, semester: 2 },
];

/**
 * 默认场景。
 *
 * 逐条给出理由，因为它们都会直接影响结论：
 *  · 一周一个单元、每周五听写本周单元 —— 上海版教材的常规节奏
 *  · 只在周一到周五学习（周末休息）—— 周末记 0 会让曲线很难看，
 *    而且"每天都学"本身就是不现实的假设
 *  · budget.count = 12 —— "每天 10 分钟"的量级。这个数字是整场对比的关键：
 *    它必须小到"复习量与学习量会互相挤占"，否则两种调度都能把书背完，
 *    差异自然消失（见 docs 里"每天 20 个词时覆盖不是瓶颈"的说明）
 *  · dueMin = 6 —— 直接取自产品影子模式的默认预算 lib/srs/shadow.js，
 *    意味着【约束调度还背着一个"必须清 6 个到期词"的包袱】。带着包袱比，
 *    结论才不是自卖自夸
 */
export const DEFAULT_SCENE = Object.freeze({
  days: WEEKS * 7,
  studyWeekdays: [0, 1, 2, 3, 4], // 周一–周五（0 = 周一）
  dictationWeekday: 4, // 周五听完写
  budget: Object.freeze({ count: 12, newMax: 12, dueMin: 6 }),
  t0: Date.UTC(2026, 8, 1, 12, 0, 0), // 2026-09-01 12:00，只作为波形起点
});

/** 第 w 周（0 起）教的单元键，如 "7-1-3" */
export function unitOfWeek(w) {
  return unitKeyOf({ grade: TERM.grade, semester: TERM.semester, unit: w + 1 });
}

/** 候选池：按 POOL_TERMS 过滤（只留 word，短语本阶段不参与组卷） */
export function poolWords(allWords) {
  return (allWords || []).filter(
    (w) =>
      w &&
      w.entry_type === "word" &&
      w.id !== undefined &&
      POOL_TERMS.some((t) => w.grade === t.grade && w.semester === t.semester)
  );
}

// ------------------------------------------------------------
// 四、两种调度策略
// ------------------------------------------------------------

/**
 * 策略签名：(words, states, ctx, budget) => number[]（选中的词 id）
 * 一律返回 id 数组，仿真内核不关心它是怎么选出来的。
 */
export const policies = {
  /**
   * 基线甲：到期优先，新词按【词表顺序】（id 升序）。
   * 可复现，T12 对比视图用的就是它。
   */
  baseline: (words, states, ctx, budget) =>
    baselineSchedule(words, states, ctx, budget).ordered,

  /**
   * 基线乙：到期优先，新词【打乱】。
   * **这才是线上 lib/progress.js 的真实行为**（composeDailyDeck 里有 shuffle），
   * 所以它是仿真默认的基线。用甲会让失败过的词永远堵在队首、把预算吃光，
   * 从而低估基线 —— 那种"赢"没有说服力。
   */
  baselineShuffled: (words, states, ctx, budget, shuffleRng) =>
    baselineSchedule(words, states, ctx, budget, {
      freshOrder: (list) => shuffleWith(list, shuffleRng),
    }).ordered,

  /** 词跃：截止约束调度 */
  constrained: (words, states, ctx, budget) =>
    schedule(words, states, ctx, budget).ordered,
};

export const POLICY_LABEL = Object.freeze({
  baseline: "普通做法（按到期排序 · 新词按词表顺序）",
  baselineShuffled: "普通做法（按到期排序 · 新词打乱，与线上一致）",
  constrained: "词跃（截止约束调度）",
});

// ------------------------------------------------------------
// 五、仿真内核
// ------------------------------------------------------------

/**
 * 跑一个仿真学生的一整个学期。
 *
 * @param {Array} pool 候选池（已过滤为 word）
 * @param {object} [opts]
 * @param {string} [opts.policy] policies 的键
 * @param {number} [opts.seed] 随机种子（同一个 seed + 同一个 policy = 逐字节相同）
 * @param {number} [opts.days] 总天数
 * @param {number[]} [opts.studyWeekdays] 哪几天学习（0 = 周一）
 * @param {number} [opts.dictationWeekday] 哪一天听写
 * @param {object} [opts.budget] 每日预算
 * @param {number} [opts.t0] 起始时间戳
 * @returns {{
 *   policy:string, seed:number,
 *   series:Array<{day:number, week:number, scope:string, retention:number, coverage:number, due:number}>,
 *   dictations:Array<{week:number, weekLabel:string, scope:string, scopeSize:number,
 *                     retention:number, coverage:number, learnedRetention:number, predicted:number}>,
 *   peakDue:number, studied:number, exposures:number,
 *   calibration:Array<{r_pred:number, r_actual:number}>
 * }}
 */
export function simulateStudent(pool, opts = {}) {
  const policyName = opts.policy || "constrained";
  const pick = policies[policyName];
  if (!pick) throw new Error("未知调度策略：" + policyName);

  const seed = opts.seed === undefined ? 1 : opts.seed;
  // 打乱用一个与"作答抽样"完全独立的随机流。作答抽样按 (seed, day, word) 取值，
  // 不消耗顺序流 —— 所以两种调度不会互相错位（见 drawFor 的说明）。
  const shuffleRng = makeRng((seed ^ 0x5bf03635) | 0);
  const days = opts.days === undefined ? DEFAULT_SCENE.days : opts.days;
  const studyWeekdays = opts.studyWeekdays || DEFAULT_SCENE.studyWeekdays;
  const dictationWeekday =
    opts.dictationWeekday === undefined ? DEFAULT_SCENE.dictationWeekday : opts.dictationWeekday;
  const budget = opts.budget || DEFAULT_SCENE.budget;
  const t0 = opts.t0 === undefined ? DEFAULT_SCENE.t0 : opts.t0;
  /** 本次仿真用的真值模型（默认 TRUTH；稳健性检验会换掉它） */
  const T = opts.truth || TRUTH;
  /**
   * 产品侧的状态机。默认就是线上那一个；实验（反应时）可注入变体。
   * 签名统一为 (prev, ok, now, isNew, elapsed, baseline) -> { state, log }，
   * 原版 nextState 会忽略后两个参数 —— 这正是"默认路径零改动"的做法。
   */
  const stateFn = opts.stateFn || nextState;
  /** 反应时的信息量：1 = 完全由真实保持率决定，0 = 纯噪声 */
  const timingRho = opts.timingInformativeness === undefined ? 1 : opts.timingInformativeness;
  /** 该学生用时区间的两端（毫秒）。400ms = 一眼认出；9000ms = 想不起来 */
  const RT_FAST = opts.rtFast === undefined ? 400 : opts.rtFast;
  const RT_SLOW = opts.rtSlow === undefined ? 9000 : opts.rtSlow;
  let rtOkSum = 0;   // 只累加"答对"的用时（见下方注释：全量均值会自我抬高阈值）
  let rtOkN = 0;

  // 按单元分组，便于算"范围内"的各种指标
  const byUnit = new Map();
  for (const w of pool) {
    const k = unitKeyOf(w);
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k).push(w);
  }

  /** 产品看得见的状态（lv / due），调度器只拿得到这个 */
  const states = {};
  /** 真值：每个词的稳定度 S（天）—— 调度器永远看不到 */
  const S = new Map();
  /** 真值：每个词上次被接触的时间戳 */
  const lastSeen = new Map();

  const series = [];
  const dictations = [];
  const calibration = [];
  let peakDue = 0;
  let peakForgotten = 0;
  let exposures = 0;
  /** 模型盲区：lv=0 但此前确实学过（也就是"学过、没学会"）的重复接触 */
  const blindSpot = { n: 0, ok: 0 };

  for (let day = 0; day < days; day++) {
    const week = Math.floor(day / 7);
    const weekday = day % 7;
    const scopeKey = unitOfWeek(week);
    const now = t0 + day * DAY;

    const studying = studyWeekdays.includes(weekday);
    if (studying) {
      const ctx = { now, units: [scopeKey] };
      const ids = pick(pool, states, ctx, budget, shuffleRng);
      for (const id of ids) {
        const prevState = states[id] || null;
        const rPred = retrievability(prevState, now); // 产品对这一天的信念
        const seen = lastSeen.has(id);
        const dt = seen ? (now - lastSeen.get(id)) / DAY : null;
        const p = seen ? recall(S.get(id), dt) : T.P_FIRST;
        const ok = drawFor(seed, day, id) < p;

        // ⓪ 反应时（实验用）。真实感来自一个前提：**越接近遗忘，答得越慢**。
        //    这个前提本身就是要被检验的东西，所以它被做成一个显式的旋钮
        //    timingInformativeness ∈ [0,1]：
        //      1 = 用时完全由真实保持率决定（反应时是完美信号）
        //      0 = 用时与保持率无关（纯噪声）
        //    实验的意义就在于：找出"信息量至少要多高，引入反应时才划算"。
        //    用独立的哈希流取随机数，避免与决定对错的 drawFor 相关。
        const uRt = drawFor(seed ^ 0x9e3779b9, day, id);
        const z = timingRho * (1 - p) + (1 - timingRho) * uRt;
        const elapsed = Math.round(RT_FAST + (RT_SLOW - RT_FAST) * z);

        // 该学生"答对时的常态用时"（运行均值）——判据做成相对的，不写死秒数。
        //
        // ⚠️ 这里必须只统计【答对的】用时，不能统计全部：
        //    第一版用了全部作答的均值，结果在"反应时高度有信息量"时反而几乎不触发 ——
        //    因为越接近遗忘答得越慢，而复习大多发生在"快忘了"的时候，
        //    于是全量均值被自身抬高，阈值跟着水涨船高，规则自己把自己关掉了。
        //    只在答对的样本上取基线，才是"你正常答对要多久"这个正确的参照。
        const rtBaseline = rtOkN ? rtOkSum / rtOkN : 0;

        // ① 真值更新：仿真学生真的记住了多少。
        //    第一次接触与之后的复现走两套公式 —— 见 TRUTH 的注释（吸收态那一节）。
        S.set(
          id,
          seen
            ? clampS(S.get(id) * (ok ? T.GROW : T.SHRINK), T)
            : ok
              ? T.S_OK1
              : T.S_FAIL1
        );
        lastSeen.set(id, now);

        // ② 产品可见状态更新。
        //    默认走与线上完全相同的状态机；实验可注入变体（stateFn），
        //    变体只多拿一个"本次用时"，其余完全一样。
        const isNew = !prevState || prevState.lv === 0;
        states[id] = stateFn(prevState, ok, now, isNew, elapsed, rtBaseline).state;
        // 基线在本次作答【之后】更新，保证它只反映"过去"
        if (ok) { rtOkSum += elapsed; rtOkN += 1; }

        // ③ 校准样本分两类，必须分开统计：
        //    · lv > 0 —— 产品确实给出了一个"还剩几成记得"的预测，进校准曲线
        //    · lv = 0 且此前学过 —— retrievability 返回 0，那是模型的【盲区】
        //      （把"学过但没学会"和"从没见过"当成同一件事），不能混进曲线，
        //      否则整条曲线会被这个定义上的 0 淹没、看不出任何东西。
        //      它单独统计为 blindSpot，本身就是一条值得写进材料的结论。
        if (seen && prevState && prevState.lv > 0) {
          calibration.push({ r_pred: rPred, r_actual: ok ? 1 : 0, lv: prevState.lv });
        } else if (seen) {
          blindSpot.n += 1;
          if (ok) blindSpot.ok += 1;
        }
        exposures += 1;
      }
    }

    // ① 到期积压：产品口径（lv>0 且已过期）
    let due = 0;
    for (const id in states) {
      const s = states[id];
      if (s && s.lv > 0 && s.due > 0 && s.due <= now) due += 1;
    }
    if (due > peakDue) peakDue = due;

    // ② 欠账：真值口径 —— "学过、但此刻真实保持率已低于 50%"的词数。
    //    为什么需要这个口径：产品口径有个漏洞 —— 答错的词会掉回 lv=0，
    //    于是它**不再算"到期"**，积压凭空少了一块。结果是"越学不会的人积压越小"，
    //    这个指标就没法用了。真值口径只看"学生是不是真的忘了"，
    //    与调度器怎么记账无关，两种调度才可比。
    let forgotten = 0;
    for (const id of lastSeen.keys()) {
      const dt = (now - lastSeen.get(id)) / DAY;
      if (recall(S.get(id), dt) < 0.5) forgotten += 1;
    }
    if (forgotten > peakForgotten) peakForgotten = forgotten;

    // 当日曲线点：本周单元的词，平均真实保持率 + 覆盖率
    const scope = byUnit.get(scopeKey) || [];
    let rSum = 0;
    let covered = 0;
    for (const w of scope) {
      const seen = lastSeen.has(w.id);
      if (seen) {
        covered += 1;
        rSum += recall(S.get(w.id), (now - lastSeen.get(w.id)) / DAY);
      }
    }
    series.push({
      day,
      week,
      scope: scopeKey,
      scopeSize: scope.length,
      retention: scope.length ? rSum / scope.length : 0,
      coverage: scope.length ? covered / scope.length : 0,
      due,
    });

    // 听写：本周最后一个学习日结束时（当日学习已完成）
    if (weekday === dictationWeekday) {
      let predSum = 0;
      let learnedR = 0;
      let learnedN = 0;
      for (const w of scope) {
        predSum += retrievability(states[w.id], now);
        if (lastSeen.has(w.id)) {
          learnedN += 1;
          learnedR += recall(S.get(w.id), (now - lastSeen.get(w.id)) / DAY);
        }
      }
      dictations.push({
        week: week + 1,
        weekLabel: "第 " + (week + 1) + " 周",
        scope: scopeKey,
        scopeSize: scope.length,
        // 听写当天"这个词你答得对吗"的平均概率 —— 没学过的记 0（背不出来就是背不出来）
        retention: scope.length ? rSum / scope.length : 0,
        coverage: scope.length ? covered / scope.length : 0,
        // 只统计"学过"的：回答"教过之后保住了多少"
        learnedRetention: learnedN ? learnedR / learnedN : 0,
        predicted: scope.length ? predSum / scope.length : 0,
      });
    }
  }

  return {
    policy: policyName,
    seed,
    series,
    dictations,
    peakDue,
    peakForgotten,
    studied: lastSeen.size,
    mastered: Object.values(states).filter((s) => s && s.lv >= 4).length,
    // 期末熟练度分布 { lv: 词数 }（只含"产品有状态"的词）。
    // mastered 只是它的一个切片；单独给出分布，是为了能回答
    // "为什么没有词到 lv>=4" 这类追问 —— 只看一个数字答不了。
    lvDistro: (() => {
      const d = {};
      for (const id in states) {
        const s = states[id];
        const lv = s ? s.lv : 0;
        d[lv] = (d[lv] || 0) + 1;
      }
      return d;
    })(),
    blindSpot,
    exposures,
    calibration,
  };
}

// ------------------------------------------------------------
// 六、配对队列：同一个学生、同一串随机数，只换调度
// ------------------------------------------------------------

/** 算术平均；空数组返回 0 */
export function mean(xs) {
  if (!xs || !xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** 样本标准差（n−1）；少于 2 个样本返回 0 */
export function sd(xs) {
  if (!xs || xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/**
 * 配对仿真：每个学生用同一个种子跑两种调度。
 *
 * 为什么必须配对：学生的随机性（谁在这一天被抽到、答对还是答错）是最大的
 * 噪声源，配对让它对两种调度【完全相同】，剩下的差异才只能归因于调度。
 * 这也是 2.3(4) 要求的"基线均衡性"在仿真里的对应物 —— 不需要再做均衡性
 * 检验，因为两边是同一批学生、同一串随机数。
 *
 * @param {Array} pool 候选池
 * @param {object} [opts] 见 simulateStudent；额外支持 students / baseSeed
 * @returns {{
 *   students:number, seedBase:number,
 *   perStudent:Array<{seed:number, baseline:object, constrained:object}>,
 *   summary:object
 * }}
 */
/** 每个学生身上只需要带回这几个标量 + 逐周听写明细（不搬整条逐日曲线，报告会太大） */
function pick2(r) {
  return {
    peakDue: r.peakDue,
    peakForgotten: r.peakForgotten,
    studied: r.studied,
    mastered: r.mastered,
    dictations: r.dictations,
  };
}

export function runPairedCohort(pool, opts = {}) {
  const students = opts.students === undefined ? 12 : opts.students;
  const baseSeed = opts.baseSeed === undefined ? 20261005 : opts.baseSeed;
  /** 用哪一种基线口径 —— 默认用与线上一致的"新词打乱" */
  const baselinePolicy = opts.baselinePolicy || "baselineShuffled";
  if (!policies[baselinePolicy]) throw new Error("未知基线策略：" + baselinePolicy);

  const perStudent = [];
  for (let i = 0; i < students; i++) {
    const seed = baseSeed + i * 7919; // 7919 是质数：相邻种子不会产生相关的随机流
    const shared = { ...opts, seed };
    perStudent.push({
      seed,
      baseline: simulateStudent(pool, { ...shared, policy: baselinePolicy }),
      constrained: simulateStudent(pool, { ...shared, policy: "constrained" }),
    });
  }

  /** 取某个调度在每位学生身上的某个标量 */
  const col = (which, fn) => perStudent.map((p) => fn(p[which]));

  const metrics = {
    // ① 听写当天、范围内词的平均保持率（跨周跨学生的平均）
    dictationRetention: {
      baseline: col("baseline", (r) => mean(r.dictations.map((d) => d.retention))),
      constrained: col("constrained", (r) => mean(r.dictations.map((d) => d.retention))),
    },
    // ② 听写当天、范围内词的覆盖率（学过的比例）
    dictationCoverage: {
      baseline: col("baseline", (r) => mean(r.dictations.map((d) => d.coverage))),
      constrained: col("constrained", (r) => mean(r.dictations.map((d) => d.coverage))),
    },
    // ③ 欠账峰值（真值口径：学过但真实保持率已跌破 50% 的词数）
    peakForgotten: {
      baseline: col("baseline", (r) => r.peakForgotten),
      constrained: col("constrained", (r) => r.peakForgotten),
    },
    // ④ 到期积压峰值（产品口径）
    peakDue: {
      baseline: col("baseline", (r) => r.peakDue),
      constrained: col("constrained", (r) => r.peakDue),
    },
    // ⑤ 一学期结束时达到"已掌握"（lv≥4）的词数 —— 防"只顾范围内、总量崩了"的质疑
    mastered: {
      baseline: col("baseline", (r) => r.mastered),
      constrained: col("constrained", (r) => r.mastered),
    },
  };

  const summary = {};
  for (const key of Object.keys(metrics)) {
    const b = metrics[key].baseline;
    const c = metrics[key].constrained;
    const paired = c.map((v, i) => v - b[i]); // 配对差值：正 = 词跃更高
    summary[key] = {
      baseline: { mean: mean(b), sd: sd(b) },
      constrained: { mean: mean(c), sd: sd(c) },
      diff: { mean: mean(paired), sd: sd(paired) },
      // 配对差值里"词跃更好"的学生数 —— 比 p 值更直观，也不需要正态假设
      wins: paired.filter((d) => d > 1e-12).length,
      losses: paired.filter((d) => d < -1e-12).length,
      students,
    };
  }

  return {
    students,
    seedBase: baseSeed,
    baselinePolicy,
    perStudent: perStudent.map((p) => ({
      seed: p.seed,
      baseline: pick2(p.baseline),
      constrained: pick2(p.constrained),
    })),
    summary,
    /** 曲线用：把所有学生按天平均，压成一条线 */
    series: {
      days: perStudent[0].constrained.series.map((d) => d.day),
      scope: perStudent[0].constrained.series.map((d) => d.scope),
      baseline: averageSeries(perStudent.map((p) => p.baseline.series)),
      constrained: averageSeries(perStudent.map((p) => p.constrained.series)),
      dictationDays: perStudent[0].constrained.series
        .filter((d) => d.day % 7 === (opts.dictationWeekday === undefined ? DEFAULT_SCENE.dictationWeekday : opts.dictationWeekday))
        .map((d) => d.day),
    },
    /** 校准曲线用：把全部学生的 (预测, 实际) 汇总 */
    calibration: perStudent.flatMap((p) => p.constrained.calibration),
    /** 模型盲区汇总（两种调度都会有，这里合并统计） */
    blindSpot: (() => {
      let n = 0;
      let ok = 0;
      for (const p of perStudent) {
        for (const r of [p.baseline, p.constrained]) {
          n += r.blindSpot.n;
          ok += r.blindSpot.ok;
        }
      }
      return { n, ok, rate: n ? ok / n : 0 };
    })(),
  };
}

/** 把多个学生的逐日曲线压成一条平均曲线 */
function averageSeries(list) {
  if (!list.length) return [];
  return list[0].map((_, i) => ({
    retention: mean(list.map((s) => s[i].retention)),
    coverage: mean(list.map((s) => s[i].coverage)),
    due: mean(list.map((s) => s[i].due)),
  }));
}

// ------------------------------------------------------------
// 七、校准曲线（T26 的核心）
// ------------------------------------------------------------

/**
 * 把 (预测保持率, 实际答对) 样本按预测值分箱。
 *
 * 一个好模型的表现是：每一箱的"平均预测"≈"实际正确率"（对角线）。
 * 预测普遍高于实际 = 过度自信；普遍低于 = 过度保守。
 *
 * @param {Array<{r_pred:number, r_actual:number}>} samples
 * @param {number} [bins] 箱数
 * @returns {Array<{lo:number, hi:number, mid:number, n:number, predicted:number, actual:number}>}
 */
export function calibrationCurve(samples, bins = 10) {
  const out = [];
  for (let i = 0; i < bins; i++) {
    out.push({ lo: i / bins, hi: (i + 1) / bins, mid: (i + 0.5) / bins, n: 0, predSum: 0, okSum: 0 });
  }
  for (const s of samples || []) {
    const r = Number(s.r_pred);
    if (!Number.isFinite(r)) continue;
    let idx = Math.floor(r * bins);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    const b = out[idx];
    b.n += 1;
    b.predSum += r;
    b.okSum += s.r_actual ? 1 : 0;
  }
  return out.map((b) => ({
    lo: b.lo,
    hi: b.hi,
    mid: b.mid,
    n: b.n,
    predicted: b.n ? b.predSum / b.n : 0,
    actual: b.n ? b.okSum / b.n : 0,
  }));
}

/**
 * 校准误差：样本量加权的 |预测 − 实际| 平均值（0 = 完美校准）。
 * 用加权而不是简单平均，是因为高分区箱里常常只有几个样本，
 * 不加权会让几个噪声点主导结论。
 */
export function calibrationError(curve) {
  let wsum = 0;
  let acc = 0;
  for (const b of curve || []) {
    if (!b.n) continue;
    wsum += b.n;
    acc += b.n * Math.abs(b.predicted - b.actual);
  }
  return wsum ? acc / wsum : 0;
}

export default {
  TRUTH,
  TRUTH_VARIANTS,
  recall,
  makeRng,
  drawFor,
  shuffleWith,
  DEFAULT_SCENE,
  WEEKS,
  TERM,
  POOL_TERMS,
  unitOfWeek,
  poolWords,
  policies,
  POLICY_LABEL,
  simulateStudent,
  runPairedCohort,
  calibrationCurve,
  calibrationError,
  mean,
  sd,
};
