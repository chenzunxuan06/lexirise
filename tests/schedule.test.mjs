// ============================================================
// tests/schedule.test.mjs —— 组卷调度 lib/srs/schedule.js 的单元测试
// ------------------------------------------------------------
// 词跃 LexiRise
//
// 运行（在 web 目录下）：
//   node --test "tests/schedule.test.mjs"
//
// 零第三方依赖：只用 node:test + node:assert/strict。
// 两条硬约定：
//   · 所有时间都是固定常量 NOW 推算出来的，测试里绝不出现 Date.now()
//     —— 十年后再跑，结果一模一样
//   · 每个用例的中文描述写清"在验证什么"
// ============================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_WEIGHTS, schedule } from "../lib/srs/schedule.js";
import { unitKeyOf } from "../lib/units.js";
import { DAY } from "../lib/srs/model.js";

/** 固定时间基准（2023-11-14T22:13:20Z）；所有 due 都由它推算 */
const NOW = 1700000000000;

/** 相对基准的天数偏移 → 时间戳；负数 = 过去（已到期） */
function at(dayOffset) {
  return NOW + dayOffset * DAY;
}

/** 造一个词条：默认 7 年级上学期第 1 单元、单词类型 */
function word(id, { unit = 1, entry_type = "word", grade = 7, semester = 1 } = {}) {
  return { id, grade, semester, unit, entry_type };
}

/** 造一条记忆状态：字段与 lib/srs/model.js 的 EMPTY 对齐 */
function state({ lv = 0, due = 0, ok = 0, total = 0 } = {}) {
  return { lv, due, lapses: 0, last: 0, ok, total, first: 0 };
}

/** 本次考试范围：7-1-1、7-1-2 */
const SCOPE = { now: NOW, units: ["7-1-1", "7-1-2"] };

test("用例1：范围内且已到期的词，排在范围外且未到期的词前面", () => {
  // 2 号在范围内且逾期 2 天；1 号在范围外、还要 5 天才到期
  const words = [word(1, { unit: 3 }), word(2, { unit: 1 })];
  const states = {
    1: state({ lv: 3, due: at(5) }),
    2: state({ lv: 3, due: at(-2) }),
  };

  const res = schedule(words, states, SCOPE, { count: 10, newMax: 10 });

  assert.deepEqual(res.ordered, [2, 1], "考纲内 + 已到期的词必须先背");
  const s2 = res.scored.find((x) => x.id === 2);
  const s1 = res.scored.find((x) => x.id === 1);
  assert.equal(s2.reason.inScope, true, "2 号被判定在考试范围内");
  assert.equal(s1.reason.inScope, false, "1 号被判定在考试范围外");
  assert.ok(s2.score > s1.score, "范围内 + 到期的得分必须更高");
  assert.equal(s2.reason.overdue, 2, "逾期天数按天计：逾期 2 天");
  assert.equal(s1.reason.overdue, 0, "未到期的词 overdue 必须是 0（不能是负数）");
});

test("用例2：新词配额生效 —— newMax=2 时输出的新词不超过 2 个", () => {
  // 5 个范围内新词（得分最高）+ 3 个范围外且未到期的复习词
  const words = [
    ...[1, 2, 3, 4, 5].map((id) => word(id, { unit: 1 })),
    ...[11, 12, 13].map((id) => word(id, { unit: 9 })),
  ];
  const states = {
    11: state({ lv: 4, due: at(3), ok: 4, total: 4 }),
    12: state({ lv: 4, due: at(3), ok: 4, total: 4 }),
    13: state({ lv: 4, due: at(3), ok: 4, total: 4 }),
  };

  const res = schedule(words, states, SCOPE, { count: 8, newMax: 2 });
  const pickedNew = res.ordered.filter((id) => id <= 5);
  assert.equal(pickedNew.length, 2, "新词最多只能取 newMax 个");
  assert.deepEqual(pickedNew, [1, 2], "同分新词按 id 升序取前 2 个");
  assert.equal(res.ordered.length, 5, "新词被配额挡住后，剩余预算由复习词填满（共 2 + 3）");

  // newMax 不传 = 不限
  const unlimited = schedule(words, states, SCOPE, { count: 8 });
  assert.equal(unlimited.ordered.filter((id) => id <= 5).length, 5, "newMax 缺省时新词不受限");

  // newMax = 0 = 本次一个新词都不给
  const zero = schedule(words, states, SCOPE, { count: 8, newMax: 0 });
  assert.equal(zero.ordered.filter((id) => id <= 5).length, 0, "newMax=0 时不能出现新词");
  assert.deepEqual(zero.ordered, [11, 12, 13], "预算没被新词占掉，复习词全数入选");
});

test("用例3：其余条件相同时，到期越久排得越靠前", () => {
  // 两个词 lv 相同、都在范围内、都没有作答历史 —— 唯一差别是逾期天数
  const words = [word(1), word(2)];
  const states = {
    1: state({ lv: 2, due: at(-3) }),
    2: state({ lv: 2, due: at(-10) }),
  };

  const res = schedule(words, states, SCOPE, { count: 10, newMax: 10 });

  assert.deepEqual(res.ordered, [2, 1], "逾期 10 天的词要排在逾期 3 天的词前面");
  assert.equal(res.scored[0].reason.overdue, 10);
  assert.equal(res.scored[1].reason.overdue, 3);
  assert.ok(res.scored[0].score > res.scored[1].score, "逾期越久到期补贴越高");
});

test("用例4：其余条件相同时，历史错误率高的排前面", () => {
  // 两词 lv、到期时刻完全相同（正好到期 → overdue 为 0），差别只在 ok/total
  const words = [word(1), word(2)];
  const states = {
    1: state({ lv: 3, due: NOW, ok: 4, total: 4 }), // 全对 → errRate 0
    2: state({ lv: 3, due: NOW, ok: 1, total: 4 }), // 错 3 次 → errRate 0.75
  };

  const res = schedule(words, states, SCOPE, { count: 10, newMax: 10 });

  assert.deepEqual(res.ordered, [2, 1], "总错的词要先复习");
  assert.equal(res.scored[0].reason.errRate, 0.75, "errRate = 1 - ok/total = 0.75");
  assert.equal(res.scored[1].reason.errRate, 0, "全对的词 errRate 为 0");
  assert.equal(res.scored[0].reason.overdue, 0, "正好到期算 0 天逾期");
  assert.equal(res.scored[0].reason.daysToDue, 0, "正好到期 → 距到期 0 天");
});

test("用例5：短语条目被跳过（entry_type !== \"word\"）", () => {
  const words = [
    word(1, { unit: 1 }),
    word(2, { unit: 1, entry_type: "phrase" }), // 范围内新短语：若不跳过必然排第一
    { id: 3, grade: 7, semester: 1, unit: 1 }, // 连 entry_type 字段都没有的脏数据
  ];

  const res = schedule(words, {}, SCOPE, { count: 10, newMax: 10 });

  assert.deepEqual(res.ordered, [1], "只有 entry_type 为 word 的条目参与组卷");
  assert.equal(res.scored.some((x) => x.id === 2), false, "短语不应出现在打分表里");
  assert.equal(res.scored.some((x) => x.id === 3), false, "缺 entry_type 的条目同样被跳过");

  // 顺带固定新词的语义：从没排过复习计划 → 不享受逾期补贴，也没有到期日
  const only = res.scored[0];
  assert.equal(only.reason.lv, 0, "无记忆状态 = 新词（lv 0）");
  assert.equal(only.reason.overdue, 0, "新词从未排期，逾期按 0 计");
  assert.equal(only.reason.daysToDue, null, "新词没有到期日 → daysToDue 为 null");
});

test("用例6：纯函数 & 确定性 —— 不修改入参、重复调用结果完全一致", () => {
  const words = [
    word(1, { unit: 3 }),
    word(2, { unit: 1 }),
    word(3, { unit: 2 }),
    word(4, { unit: 1 }),
    word(5, { unit: 1, entry_type: "phrase" }),
  ];
  const states = {
    1: state({ lv: 0 }),
    2: state({ lv: 4, due: at(-6), ok: 2, total: 5 }),
    3: state({ lv: 1, due: at(2), ok: 1, total: 4 }),
    4: state({ lv: 2, due: at(-1), ok: 3, total: 3 }),
  };
  const c = { now: NOW, units: ["7-1-1", "7-1-2"] };
  const budget = { count: 3, newMax: 1 };
  const before = JSON.stringify({ words, states, c, budget });

  const first = schedule(words, states, c, budget);
  const second = schedule(words, states, c, budget);

  assert.deepEqual(second, first, "同一份输入跑两次，ordered / scored 必须逐字段一致");
  assert.equal(
    JSON.stringify({ words, states, c, budget }),
    before,
    "调用不得修改传入的 words / states / c / budget"
  );

  // 再把入参全部冻结跑第三遍：内部只要有一次写入就会直接抛 TypeError
  const frozenWords = Object.freeze(words.map((w) => Object.freeze({ ...w })));
  const frozenStates = Object.freeze(
    Object.fromEntries(Object.entries(states).map(([k, v]) => [k, Object.freeze({ ...v })]))
  );
  const frozenC = Object.freeze({ now: NOW, units: Object.freeze([...c.units]) });
  const frozenBudget = Object.freeze({ ...budget });
  const third = schedule(frozenWords, frozenStates, frozenC, frozenBudget);

  assert.deepEqual(third, first, "冻结入参后结果不变 —— 证明确实没有写入输入");
  assert.notEqual(third.scored[0], first.scored[0], "返回的是新对象，不是入参的引用");
});

test("用例7：预算 count 生效，且每条打分理由字段齐全", () => {
  const words = [word(1), word(2), word(3), word(4)];
  const states = {
    1: state({ lv: 5, due: at(-9), ok: 1, total: 4 }),
    2: state({ lv: 3, due: at(-4), ok: 3, total: 4 }),
    3: state({ lv: 2, due: at(1), ok: 1, total: 2 }),
    4: state({ lv: 1, due: at(6), ok: 1, total: 2 }),
  };

  const res = schedule(words, states, SCOPE, { count: 2, newMax: 10 });

  assert.equal(res.ordered.length, 2, "count=2 时最多只输出 2 个词");
  assert.deepEqual(res.ordered, [1, 2], "入选的是得分最高的两个（逾期最久 → 次久）");

  // scored 是本次全部候选的打分表（含被预算裁掉的词），这是本实现的解释
  assert.equal(res.scored.length, 4, "打分表覆盖全部合格候选，不只入选的");
  for (const item of res.scored) {
    for (const key of ["inScope", "lv", "overdue", "daysToDue", "errRate"]) {
      assert.ok(Object.hasOwn(item.reason, key), `reason 缺少字段 ${key}`);
    }
    assert.equal(typeof item.score, "number", "score 必须是数字");
  }

  const top = res.scored[0];
  assert.equal(top.id, 1);
  assert.equal(top.reason.inScope, true);
  assert.equal(top.reason.overdue, 9);
  assert.equal(top.reason.daysToDue, -9, "已超期 → daysToDue 为负数");
  assert.equal(top.reason.errRate, 0.75);
  // 3 号与 4 号得分完全相同（都在范围内、都未到期、错误率都 0.5）→ 按 id 升序
  assert.deepEqual(
    res.scored.map((x) => x.id),
    [1, 2, 3, 4],
    "3 与 4 同分，按 id 升序稳定排列"
  );
});

test("用例8：同分时按 id 升序 —— 顺序与入参排列无关", () => {
  const words = [1, 2, 3, 4, 5].map((id) => word(id, { unit: 1 }));
  const budget = { count: 5, newMax: 5 };

  const forward = schedule(words, {}, SCOPE, budget);
  assert.deepEqual(forward.ordered, [1, 2, 3, 4, 5], "五个完全同分的新词按 id 升序输出");

  const reversed = schedule([...words].reverse(), {}, SCOPE, budget);
  assert.deepEqual(reversed.ordered, forward.ordered, "把入参倒过来，结果必须一模一样");

  const shuffled = schedule([words[3], words[0], words[4], words[2], words[1]], {}, SCOPE, budget);
  assert.deepEqual(shuffled.ordered, forward.ordered, "打乱入参顺序，结果依旧相同");
});

test("用例9：unitKeyOf 生成「年级-学期-单元」键，并与 c.units 的字符串直接可比", () => {
  assert.equal(unitKeyOf({ grade: 7, semester: 1, unit: 1 }), "7-1-1");
  assert.equal(unitKeyOf({ grade: 8, semester: 2, unit: 12 }), "8-2-12");
  assert.equal(unitKeyOf(word(99, { unit: 3 })), "7-1-3", "直接吃 words.json 里的词条对象");

  const res = schedule([word(1, { unit: 3 })], {}, SCOPE, { count: 5, newMax: 5 });
  assert.equal(res.scored[0].reason.inScope, false, "7-1-3 不在范围 [7-1-1, 7-1-2] 内");
});

test("用例10：DEFAULT_WEIGHTS 与规格一致，且 W 可以逐项覆盖", () => {
  assert.deepEqual(
    DEFAULT_WEIGHTS,
    { newWord: 0.6, inScope: 1.0, outScope: 0.15, overdue: 0.8, errorRate: 0.7 },
    "默认权重被规格冻结，改动必须是有意识的"
  );

  // 把 outScope 抬到比 inScope 还高 → 范围外的词反超，证明 W 真的接进去了
  const words = [word(1, { unit: 1 }), word(2, { unit: 3 })];
  const budget = { count: 1, newMax: 5 };

  assert.equal(schedule(words, {}, SCOPE, budget).ordered[0], 1, "默认权重下范围内优先");
  assert.equal(
    schedule(words, {}, SCOPE, budget, { outScope: 5 }).ordered[0],
    2,
    "覆盖 outScope 后范围外的词反超"
  );
  assert.equal(unitKeyOf(words[0]), "7-1-1");
});

test("用例11：dueMin 到期词保底 —— 范围外的到期词不会被永远压住", () => {
  const T = 1700000000000;
  const words = [
    word(1, { unit: 1 }), // 范围内，没学过
    word(2, { unit: 1 }),
    word(3, { unit: 1 }),
    word(4, { unit: 9 }), // 范围外，已过期很久
    word(5, { unit: 9 }),
  ];
  const states = {
    4: { lv: 3, due: T - 10 * 86400000, ok: 3, total: 4 },
    5: { lv: 3, due: T - 10 * 86400000, ok: 3, total: 4 },
  };
  const c = { now: T, units: ["7-1-1"] };

  // 不保底：范围外的到期词会被范围内的新词全部挤掉
  const noFloor = schedule(words, states, c, { count: 3, newMax: 3 });
  assert.equal(noFloor.ordered.filter((id) => id >= 4).length, 0, "不保底时范围外到期词一个都进不来");

  // 保底 2 个：它们必须进
  const floored = schedule(words, states, c, { count: 3, newMax: 3, dueMin: 2 });
  assert.equal(floored.ordered.filter((id) => id >= 4).length, 2, "保底名额应留给到期词");
  assert.equal(floored.ordered.length, 3, "总数仍受 count 约束");
});
