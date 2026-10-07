// ============================================================
// tests/model-timed.test.mjs —— 反应时变体状态机
// ------------------------------------------------------------
// 这个变体**默认不启用**（见 lib/srs/model.js）。本测试保证两件事：
//   ① 没有可靠反应时数据时，行为与原状态机【逐字节一致】（兜底不能有偏差）
//   ② 有数据时，它只改「慢答对」这一种情况 —— 答错路径一个字节都不许动
// ============================================================
import test from "node:test";
import assert from "node:assert/strict";
import { nextState, nextStateTimed, INTERVALS, DAY, RELEARN_MS, MAX_LV } from "../lib/srs/model.js";

const NOW = 1790000000000;
const BASELINE = 2000; // 该学生答对时的常态用时（毫秒）

test("兜底：没有反应时数据时，与原状态机逐字节一致", () => {
  const cases = [
    [null, true, true, 0, 0],
    [{ lv: 3, due: NOW - 1, lapses: 1, last: NOW - DAY, ok: 4, total: 5, first: NOW - 9 * DAY }, true, false, 0, 0],
    [{ lv: 5, due: NOW, lapses: 0, last: NOW - 2 * DAY, ok: 5, total: 5, first: NOW - 9 * DAY }, false, false, 1234, 0],
    [{ lv: 2, due: NOW, lapses: 2, last: NOW - DAY, ok: 2, total: 4, first: NOW - 9 * DAY }, true, false, NaN, NaN],
    [{ lv: 7, due: NOW, lapses: 0, last: NOW - DAY, ok: 7, total: 7, first: NOW - 9 * DAY }, true, false, -5, 2000],
  ];
  for (const [prev, ok, isNew, elapsed, baseline] of cases) {
    const a = nextState(prev, ok, NOW, isNew).state;
    const b = nextStateTimed(prev, ok, NOW, isNew, elapsed, baseline).state;
    assert.deepEqual(b, a, "elapsed=" + elapsed + " baseline=" + baseline);
  }
});

test("慢答对：等级保持不动，但重排到当前等级的间隔", () => {
  const prev = { lv: 4, due: NOW, lapses: 0, last: NOW - 7 * DAY, ok: 4, total: 4, first: NOW - 30 * DAY };
  const { state, log } = nextStateTimed(prev, true, NOW, false, BASELINE * 3, BASELINE);
  assert.equal(state.lv, 4, "等级必须保持不动");
  assert.equal(log.held, true, "必须记录这次是保持");
  assert.equal(state.due, NOW + INTERVALS[4] * DAY, "按当前等级的间隔重排");
  assert.ok(state.due < NOW + INTERVALS[5] * DAY, "必须早于升级后的到期时间");
  assert.equal(state.ok, prev.ok + 1, "答对计数照样要加");
});

test("快答对：正常升级", () => {
  const prev = { lv: 4, due: NOW, lapses: 0, last: NOW - 7 * DAY, ok: 4, total: 4, first: NOW - 30 * DAY };
  const { state, log } = nextStateTimed(prev, true, NOW, false, BASELINE / 2, BASELINE);
  assert.equal(state.lv, 5);
  assert.equal(state.due, NOW + INTERVALS[5] * DAY);
  assert.equal(log.held, false);
});

test("边界：正好等于阈值不算慢", () => {
  const prev = { lv: 2, due: NOW, lapses: 0, last: NOW - 2 * DAY, ok: 2, total: 2, first: NOW - 10 * DAY };
  const { state } = nextStateTimed(prev, true, NOW, false, BASELINE * 1.5, BASELINE);
  assert.equal(state.lv, 3, "只有严格大于阈值才算慢");
});

test("答错路径完全不受用时影响", () => {
  const prev = { lv: 6, due: NOW, lapses: 1, last: NOW - DAY, ok: 6, total: 8, first: NOW - 40 * DAY };
  for (const el of [1, BASELINE, BASELINE * 100, 0, NaN]) {
    const { state } = nextStateTimed(prev, false, NOW, false, el, BASELINE);
    assert.equal(state.lv, 4, "答错一律退 2 级");
    assert.equal(state.due, NOW + RELEARN_MS, "答错一律 10 分钟后复现");
  }
});

test("上限：不会超过最高等级", () => {
  const top = { lv: MAX_LV, due: NOW, lapses: 0, last: NOW - 120 * DAY, ok: 9, total: 9, first: NOW - 300 * DAY };
  assert.equal(nextStateTimed(top, true, NOW, false, 100, BASELINE).state.lv, MAX_LV);
  assert.equal(nextStateTimed(top, true, NOW, false, 99999, BASELINE).state.lv, MAX_LV);
});

test("确定性 + 不修改入参", () => {
  const prev = { lv: 3, due: NOW, lapses: 1, last: NOW - 4 * DAY, ok: 3, total: 5, first: NOW - 20 * DAY };
  const a = JSON.stringify(nextStateTimed(prev, true, NOW, false, 5000, BASELINE));
  const b = JSON.stringify(nextStateTimed(prev, true, NOW, false, 5000, BASELINE));
  assert.equal(a, b);
  assert.deepEqual(prev, { lv: 3, due: NOW, lapses: 1, last: NOW - 4 * DAY, ok: 3, total: 5, first: NOW - 20 * DAY },
    "不得就地修改入参");
});
