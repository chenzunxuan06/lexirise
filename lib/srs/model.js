// ============================================================
// lib/srs/model.js —— 记忆状态机（纯函数层）
// ------------------------------------------------------------
// 词跃 LexiRise
//
// 三条设计约束：
//   ① 纯函数：不碰 localStorage / DOM / 网络 —— 可在 Node 里离线跑几万次
//   ② 无副作用：输入相同 → 输出相同（这是做对照实验的前提）
//   ③ 行为与 lib/memory.js 原实现逐字节一致
//      由 tests/srs.test.mjs 的「黄金测试」保证（480 次作答必须复现 fixture）
// ============================================================

export const DAY = 86400000;

/** 答错后的复现间隔：10 分钟 */
export const RELEARN_MS = 10 * 60 * 1000;

/** 熟练度 0–8 对应的复习间隔（天）。lv 0 在答对路径上不会被用到 */
export const INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];

/** 熟练度上限 */
export const MAX_LV = 8;

/** 单条记忆状态的初始值 */
export const EMPTY = { lv: 0, due: 0, lapses: 0, last: 0, ok: 0, total: 0, first: 0 };

/**
 * 状态迁移：把一次作答的结果作用到记忆状态上。
 *
 * @param {object|null} prev 之前的记忆状态（null = 从没学过）
 * @param {boolean} ok 是否答对 / 认识
 * @param {number} now 当前时间戳（毫秒）
 * @param {boolean} isNew 是否首次学习该词
 * @returns {{state: object, log: object}} 新状态 + 本次作答的可记录信息
 */
export function nextState(prev, ok, now, isNew = false) {
  const cur = { ...EMPTY, ...(prev || {}) };
  const log = { lv_before: cur.lv, due_before: cur.due };

  cur.total += 1;
  if (ok) {
    cur.ok += 1;
    cur.lv = Math.min(MAX_LV, cur.lv + 1);
    cur.due = now + INTERVALS[cur.lv] * DAY;
  } else {
    cur.lapses += 1;
    cur.lv = Math.max(0, cur.lv >= 2 ? cur.lv - 2 : 0);
    cur.due = now + RELEARN_MS;
  }
  cur.last = now;
  if (isNew) cur.first = cur.first || now;

  log.lv_after = cur.lv;
  log.due_after = cur.due;
  return { state: cur, log };
}

// ------------------------------------------------------------
// 反应时感知的状态机（**实验变体，默认不启用**）
// ------------------------------------------------------------
// 为什么要单独一个函数、而不是改 nextState：
//   nextState 的行为被黄金测试锁死（必须与原实现逐字节一致），
//   而"要不要让反应时影响掌握判断"**是一个尚未被数据回答的问题**。
//   所以：默认路径一个字节都不动，变体挂在旁边，由实验来决定要不要换。
//
// 假设（这就是要被检验的东西）：
//   答对了、但明显比这个人自己的常态慢 —— 说明这个词处在"将忘未忘"的边缘，
//   此时把它当作一次扎实的掌握来升级，是**高估**了记忆状态。
//
// 判据刻意做成"相对本人常态"，而不是写死一个秒数：
//   同一个 8 秒，对刚上手的学生是正常，对熟练的学生就是异常。
//
// @param {number} elapsed 本次作答用时（毫秒）；缺失或非法时**退化为原行为**
// @param {number} baseline 该学生近期的典型用时（毫秒）；缺失时退化为原行为
// @param {number} slowFactor 超过 baseline 的多少倍算"慢"，默认 1.5

/** 慢答对时，等级不上不下时使用的"保守保持"间隔（天） */
export const HOLD_INTERVAL_DAYS = 1;

export function nextStateTimed(prev, ok, now, isNew, elapsed, baseline, slowFactor = 1.5) {
  const cur = { ...EMPTY, ...(prev || {}) };
  // held 一开始就定义好（而不是只在慢分支里赋值）：
  // 调用方拿到的 log 形状必须恒定，否则要靠 undefined 判断，
  // 是那种"上线半年后才在某个分支炸掉"的坑。
  const log = { lv_before: cur.lv, due_before: cur.due, held: false };

  const e = Number(elapsed);
  const b = Number(baseline);
  // 没有可靠的反应时数据 -> 完全按原行为走（这是"能记但没记"的兜底）
  const usable = Number.isFinite(e) && e > 0 && Number.isFinite(b) && b > 0;
  const slow = usable && e > b * slowFactor;

  cur.total += 1;
  if (ok) {
    cur.ok += 1;
    if (slow) {
      // 慢答对：承认"这次想起来了"，但不承认"已经掌握到下一级"。
      // 等级保持不动，到期时间按一个较短的间隔重排 —— 尽早再验证一次。
      cur.due = now + Math.max(HOLD_INTERVAL_DAYS, INTERVALS[cur.lv]) * DAY;
      log.held = true;
    } else {
      cur.lv = Math.min(MAX_LV, cur.lv + 1);
      cur.due = now + INTERVALS[cur.lv] * DAY;
    }
  } else {
    cur.lapses += 1;
    cur.lv = Math.max(0, cur.lv >= 2 ? cur.lv - 2 : 0);
    cur.due = now + RELEARN_MS;
  }
  cur.last = now;
  if (isNew) cur.first = cur.first || now;

  log.lv_after = cur.lv;
  log.due_after = cur.due;
  log.slow = slow;
  return { state: cur, log };
}

/**
 * 稳定度 S（天）：把间隔表当作记忆稳定度来解释。
 *
 * 这一步【不改变任何调度行为】，只是给 lv 补上概率语义 ——
 * 否则调度器无法回答"这个词到周三还剩多少概率记得"。
 *
 * @param {number} lv 熟练度
 * @returns {number} 稳定度天数；lv<=0 时为 0
 */
export function stabilityOf(lv) {
  const i = Math.min(MAX_LV, Math.max(0, Number(lv) || 0));
  return INTERVALS[i] || 0;
}

/**
 * 可提取性 R：距上次作答 Δ 天后仍能回忆起的概率。
 *
 * 模型：指数遗忘曲线 R = exp(-Δ / S)，S 取当前 lv 对应的间隔。
 * 推论：在"正好到期"的时刻，R 恒为 e⁻¹ ≈ 36.8%。
 *
 * @param {object|null} state 记忆状态
 * @param {number} now 当前时间戳（毫秒）
 * @returns {number} 0–1；无有效状态时为 0
 */
export function retrievability(state, now) {
  if (!state || !state.last || !state.lv) return 0;
  const s = stabilityOf(state.lv);
  if (s <= 0) return 0;
  const days = (now - state.last) / DAY;
  if (days <= 0) return 1;
  return Math.exp(-days / s);
}
