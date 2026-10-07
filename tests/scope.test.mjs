// ============================================================
// tests/scope.test.mjs —— 题库出题范围（T20/T21 分单元）
// 用法（在 web/ 目录下）:  node --test "tests/scope.test.mjs"
//
// 为什么单独测这个：范围是"学生练哪几道题"的唯一输入。
// 它错了不会报错，只会安静地出别的单元的题 —— 那正是这次要修的东西。
// ============================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScope, filterScope, itemUnitKey, scopeText, unitOptions, scopeHref } from "../lib/bank.js";
import { unitKey } from "../lib/units.js";
import { readFileSync } from "node:fs";

/** 造一个 URLSearchParams 样子的东西（parseScope 只用到 get） */
const q = (s) => new URLSearchParams(s);

/**
 * 造题。⚠️ unit 存的是**键**（"7-1-1"），不是裸单元号 ——
 * 这是题库（cloze.json / forms.json）的真实形状，别按 words.json 想当然。
 */
const item = (id, grade, semester, unit) => ({
  id,
  grade,
  semester,
  unit: unitKey(grade, semester, unit),
});

const ITEMS = [
  item("a", 7, 1, 1), item("b", 7, 1, 1), item("c", 7, 1, 2),
  item("d", 8, 1, 1), item("e", 8, 1, 3), item("f", 8, 1, 3),
  item("g", 8, 2, 3),
];

// ---------- 解析 ----------

test("范围：不带参数 = 全册（老行为不变）", () => {
  assert.equal(parseScope(q("")), null);
});

test("范围：只给单元号不算数（缺年级/学期就退回全册）", () => {
  assert.equal(parseScope(q("unit=3")), null);
  assert.equal(parseScope(q("grade=8&unit=3")), null);
});

test("范围：年级+学期 = 整册，key 为 null", () => {
  const s = parseScope(q("grade=7&semester=1"));
  assert.equal(s.grade, 7);
  assert.equal(s.semester, 1);
  assert.equal(s.unit, null);
  assert.equal(s.key, null);
  assert.equal(s.slot, "7A");
  assert.equal(s.label, "七上");
});

test("范围：再加上单元号 = 本单元，键与 lib/units.js 完全一致", () => {
  const s = parseScope(q("grade=8&semester=1&unit=3"));
  assert.equal(s.unit, 3);
  assert.equal(s.key, unitKey(8, 1, 3), "必须是同一个键 —— 不能在本模块另拼一份");
  assert.equal(s.label, "八上 U3");
});

test("范围：学期非法 / 单元号非法都退回上一层，不筛空题库", () => {
  assert.equal(parseScope(q("grade=8&semester=9&unit=3")), null, "学期 9 认不出来 = 全册");
  const s1 = parseScope(q("grade=8&semester=1&unit=0"));
  assert.equal(s1.key, null, "unit=0 当作整册");
  const s2 = parseScope(q("grade=8&semester=1&unit=abc"));
  assert.equal(s2.key, null, "unit 不是数字也当作整册");
});

// ---------- 筛选 ----------

test("筛选：全册 = 一道都不少", () => {
  assert.equal(filterScope(ITEMS, null).length, ITEMS.length);
});

test("筛选：整册只留这一册", () => {
  const s = parseScope(q("grade=8&semester=1"));
  const got = filterScope(ITEMS, s).map((x) => x.id);
  assert.deepEqual(got, ["d", "e", "f"]);
});

test("筛选：本单元只留这一个单元（跨册同单元号不会被带上）", () => {
  const s = parseScope(q("grade=8&semester=1&unit=3"));
  const got = filterScope(ITEMS, s).map((x) => x.id);
  assert.deepEqual(got, ["e", "f"], "八下 U3(g) 不能混进来");
});

test("筛选：单元里没有题时返回空数组（页面据此给空状态，而不是报错）", () => {
  const s = parseScope(q("grade=7&semester=1&unit=8"));
  assert.deepEqual(filterScope(ITEMS, s), []);
});

test("筛选：脏数据不炸（null / undefined / 缺字段）", () => {
  assert.deepEqual(filterScope(null, null), []);
  const s = parseScope(q("grade=8&semester=1&unit=3"));
  assert.deepEqual(filterScope([null, undefined, { id: "x" }], s), []);
});

test("形状：题库里 unit 存的是键；万一改成裸单元号也能对上", () => {
  assert.equal(itemUnitKey({ grade: 8, semester: 1, unit: "8-1-3" }), "8-1-3");
  assert.equal(itemUnitKey({ grade: 8, semester: 1, unit: 3 }), "8-1-3", "裸号应补成键");
  assert.equal(itemUnitKey({}), "");
  assert.equal(itemUnitKey(null), "");
  const s = parseScope(q("grade=8&semester=1&unit=3"));
  const bare = [{ id: "z", grade: 8, semester: 1, unit: 3 }];
  assert.deepEqual(filterScope(bare, s).map((x) => x.id), ["z"], "裸号形状不能被静默筛空");
});

test("真实题库：形状与本地断言一致（防止测试与产品各说各话）", () => {
  for (const f of ["cloze", "forms"]) {
    let bank;
    try {
      bank = JSON.parse(readFileSync(new URL("../public/" + f + ".json", import.meta.url), "utf8"));
    } catch {
      continue; // 题库还没生成时跳过，不让测试因为缺文件而红
    }
    const items = bank.items || [];
    assert.ok(items.length > 0, f + " 题库不该是空的");
    const bad = items.filter((it) => itemUnitKey(it) !== it.unit);
    assert.equal(bad.length, 0, f + " 里有条目的 unit 不是键：" + JSON.stringify(bad[0]));
    assert.ok(
      items.every((it) => it.grade && it.semester),
      f + " 每条都要有 grade/semester（范围筛选的前提）"
    );
  }
});

// ---------- 单元选择器 ----------

test("单元表：只列本册的单元，按单元号升序，带上各自的题数", () => {
  const s = parseScope(q("grade=8&semester=1"));
  assert.deepEqual(unitOptions(ITEMS, s), [
    { unit: 1, key: "8-1-1", label: "U1", n: 1 },
    { unit: 3, key: "8-1-3", label: "U3", n: 2 },
  ]);
});

test("单元表：在全册范围下为空（不知道是哪一册，就不猜）", () => {
  assert.deepEqual(unitOptions(ITEMS, null), []);
});

test("单元表：已经进到某个单元时，仍然列得出本册**全部**单元", () => {
  // 选择器要回答"还能去哪"，不是"现在在哪"。
  // 写成 filterScope(items, scope) 的话这里只会剩 U3 一个 —— 真浏览器抓到过这个 bug。
  const s = parseScope(q("grade=8&semester=1&unit=3"));
  assert.deepEqual(unitOptions(ITEMS, s).map((u) => u.label), ["U1", "U3"]);
});

// ---------- 链接与文案 ----------

test("链接：本单元 → 整册 → 全册都能走回去", () => {
  const s = parseScope(q("grade=7&semester=1&unit=2"));
  assert.equal(scopeHref("/cloze", s), "/cloze?grade=7&semester=1&unit=2");
  assert.equal(scopeHref("/cloze", s, null), "/cloze?grade=7&semester=1");
  assert.equal(scopeHref("/cloze", s, 5), "/cloze?grade=7&semester=1&unit=5");
  assert.equal(scopeHref("/cloze", null), "/cloze", "全册就是不带参数");
});

test("文案：三种范围说人话", () => {
  assert.equal(scopeText(null), "六册混合");
  assert.equal(scopeText(parseScope(q("grade=7&semester=2"))), "七下 · 整册");
  assert.equal(scopeText(parseScope(q("grade=9&semester=1&unit=4"))), "九上 U4");
});
