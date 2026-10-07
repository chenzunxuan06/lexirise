// ============================================================
// lib/bank.js —— 题库（T20 / T21）「出题范围」的唯一口径
// ------------------------------------------------------------
// 背景：两个题型上线时都是**全册随机抽 10 道**，抽到的是混合单元。
//   可"这周听写 Unit 3"才是真实场景 —— 学生要练的是本单元那几道。
//   所以 /cloze 与 /forms 都要支持按单元（或按整册）出题。
//
// 【为什么单独一个文件，而不是两个页面各写一遍】
//   范围就是这个键：lib/units.js 的 "年级-学期-单元"。那个键已经有一份了
//   （学生选的单元 / 这次背多少 / 考试范围都用它）。页面里再拼一次，
//   迟早在某处对不上（一处 Number、一处字符串），改口径还要改两个地方。
//
//   本模块**零依赖、不碰 fs / DOM**：页面、单元页、Node 测试都能 import。
//
// 【三种范围】—— 都不带参数时行为与改动前**完全一致**（全册随机）
//   null                        全册（六册混着抽，老行为）
//   { grade, semester }         整册（七上八个单元混着抽）
//   { grade, semester, unit }   本单元（只出这个单元的题）
//
// 【范围只影响"抽哪些题"，不影响判分与记录】
//   作答仍然走 memory.record（唯一写入点），mode 仍然是 forms / cloze。
// ============================================================

import { unitKey, bookSlot, bookLabel } from "./units.js";
import { unitLabel } from "./srs/explain.js";

/**
 * 从 URL 查询参数里解析出题范围。
 *
 * 参数认不出来（缺 grade/semester、册次非法）就当**全册** ——
 * 宁可不筛，也不要因为一个坏链接把题库筛空、让学生对着空页面。
 *
 * @param {{get:(k:string)=>string|null}} sp URLSearchParams 或任何有 get 的对象
 * @returns {{grade:number, semester:number, unit:number|null, key:string|null, slot:string, label:string}|null}
 */
export function parseScope(sp) {
  if (!sp || typeof sp.get !== "function") return null;
  const grade = Number(sp.get("grade"));
  const semester = Number(sp.get("semester"));
  const slot = bookSlot(grade, semester);
  if (!slot) return null;
  const raw = Number(sp.get("unit"));
  const unit = Number.isInteger(raw) && raw > 0 ? raw : null;
  return {
    grade,
    semester,
    unit,
    key: unit ? unitKey(grade, semester, unit) : null,
    slot,
    label: unit ? unitLabel({ grade, semester, unit }) : bookLabel(grade, semester),
  };
}

/**
 * 题库条目的单元键。
 *
 * ⚠️ 这里有个**容易看走眼的地方**：题库（public/cloze.json、forms.json）里的
 * `unit` 字段存的**就是键本身**（"7-1-1"），和语料 meta.unit 同格式；
 * 而 words.json 里的 `unit` 是**裸单元号**（1..8）。两者同名不同物。
 * 所以不能想当然写 `it.unit === scope.unit`。
 *
 * 万一哪天出题器改成存裸单元号，这里补成键 —— 不然筛选会静默筛空，
 * 页面只会说"这个单元还没有题"，看不出是口径变了。
 *
 * @returns {string} 形如 "7-1-1"；认不出来返回 ""
 */
export function itemUnitKey(it) {
  const raw = String((it && it.unit) == null ? "" : it.unit);
  if (!raw) return "";
  if (raw.includes("-")) return raw;
  return unitKey(it.grade, it.semester, raw);
}

/**
 * 按范围筛题。**不考虑其它筛选条件** —— 那是在这之后各页面自己的事。
 * @param {Array} items 题库条目（cloze.json / forms.json 的 items）
 * @param {object|null} scope parseScope 的结果
 */
export function filterScope(items, scope) {
  const list = Array.isArray(items) ? items : [];
  if (!scope) return list;
  return list
    .filter(
      (it) => it && Number(it.grade) === scope.grade && Number(it.semester) === scope.semester
    )
    .filter((it) => (scope.key ? itemUnitKey(it) === scope.key : true));
}

/**
 * 范围的可读说法（界面用）。
 *   全册 → "六册混合"；整册 → "七上 · 整册"；单元 → "七上 U3"
 */
export function scopeText(scope) {
  if (!scope) return "六册混合";
  return scope.unit ? unitLabel(scope) : scope.label + " · 整册";
}

/**
 * 这一册里"有哪些单元、各有多少道"。给单元选择器用 —— 数据来自题库本身，
 * 不需要额外请求 words.json。
 *
 * ⚠️ 这里**故意不用 filterScope(items, scope)**：那会把范围里的 unit 也算进去，
 *    于是在"七上 U1"页面上就只列得出 U1 一个单元 —— 选择器失去意义。
 *    （这个 bug 是 tests/verify-scope-ui.mjs 在真浏览器里抓出来的：
 *      范围标签对、出处对，但芯片一个都没有。）
 *    选择器要的是"这一册有哪些单元可去"，与"现在在哪"是两件事。
 *
 * @returns {Array<{unit:number, key:string, label:string, n:number}>} 单元号升序
 */
export function unitOptions(items, scope) {
  if (!scope) return [];
  const book = (Array.isArray(items) ? items : []).filter(
    (it) => it && Number(it.grade) === scope.grade && Number(it.semester) === scope.semester
  );
  const bag = new Map();
  for (const it of book) {
    const u = Number(itemUnitKey(it).split("-").pop());
    if (!u) continue;
    bag.set(u, (bag.get(u) || 0) + 1);
  }
  return [...bag.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([unit, n]) => ({
      unit,
      key: unitKey(scope.grade, scope.semester, unit),
      label: "U" + unit,
      n,
    }));
}

/**
 * 同范围内换单元（unit=null 表示整册）的链接。
 * @param {string} base 如 "/cloze"
 * @param {object|null} scope
 * @param {number|null} [unit] 不给就用 scope 自己的单元
 * @returns {string} 带查询串的地址；无范围时就是 base（全册）
 */
export function scopeHref(base, scope, unit) {
  if (!scope) return base;
  const u = unit === undefined ? scope.unit : unit;
  return (
    base +
    "?grade=" + scope.grade + "&semester=" + scope.semester + (u ? "&unit=" + u : "")
  );
}

export default { parseScope, filterScope, itemUnitKey, scopeText, unitOptions, scopeHref };
