// ============================================================
// tests/praise.test.mjs —— 收工那一句话的文案逻辑
// 用法（在 web/ 目录下）:  node --test "tests/praise.test.mjs"
//
// 这一层的风险不是崩溃，是**说错话**：
//   · 该安慰的时候在庆祝        （错一堆还说"真棒，一个没错"）
//   · 名字没填干净，露出 {name}  （那是最尴尬的 bug）
//   · 夸赞后面没有事实          （空的"真棒"没分量，这是设计纪律）
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";

import { praiseFor } from "../lib/praise.js";

test("全对：走 clean 组，事实说清「一个没错」", () => {
  const p = praiseFor({ name: "小明", kind: "judge", total: 20, correct: 20 });
  assert.ok(p.hello.includes("小明"), "要叫他的名字：" + p.hello);
  assert.ok(!p.hello.includes("{name}"), "占位符必须被替换掉");
  assert.match(p.fact, /一个没错/);
});

test("错得多：走 tough 组，绝不出现庆祝口吻", () => {
  const p = praiseFor({ name: "小红", kind: "judge", total: 20, correct: 6 });
  assert.ok(p.hello.includes("小红"));
  assert.ok(!/真棒|厉害|快呀|一个没错/.test(p.hello), "错一半以上不该庆祝：" + p.hello);
  assert.ok(!/一个没错/.test(p.fact));
});

test("有消灭错词：事实优先说「从错题本搬走了」", () => {
  const p = praiseFor({ name: "小明", total: 20, correct: 15, cleared: 3 });
  assert.match(p.fact, /3 个词/);
  assert.match(p.fact, /错题本/);
});

test("没有名字：不露占位符，也不留下孤零零的逗号", () => {
  for (let i = 0; i < 40; i++) {
    const p = praiseFor({ total: 10 + i, correct: 10 + i });
    assert.ok(!p.hello.includes("{name}"), "露占位符了：" + p.hello);
    assert.ok(!/^[，、]/.test(p.hello), "开头有孤逗号：" + p.hello);
    assert.ok(!/，$/.test(p.hello), "结尾有孤逗号：" + p.hello);
    assert.ok(!/\s{2,}/.test(p.hello), "有多余空格：" + p.hello);
  }
});

test("参照物是昨天的自己，不是别人", () => {
  const p = praiseFor({ name: "小明", total: 8, correct: 5, yesterday: 6, todayTotal: 14 });
  assert.match(p.fact, /昨天做了 6 个/);
  assert.ok(!/超越|排名|别人|多少名/.test(p.hello + p.fact), "不许出现和别人的比较");
});

test("连着两次收工不重样（同一组内轮换）", () => {
  const a = praiseFor({ name: "小明", total: 20, correct: 20 });
  const b = praiseFor({ name: "小明", total: 20, correct: 20 });
  assert.notEqual(a.hello, b.hello, "同一句反复出现就不值钱了");
});

test("边界：0 题不炸、也不编事实", () => {
  const p = praiseFor({ name: "小明", total: 0, correct: 0 });
  assert.ok(typeof p.hello === "string" && p.hello.length > 0);
  assert.equal(p.fact, "", "没做题就不要编事实");
});
