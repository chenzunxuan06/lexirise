// ============================================================
// lib/units.js —— 单元键的唯一生成处
// ------------------------------------------------------------
// 格式："年级-学期-单元"，如 "7-1-1"，对应 words.json 的 grade/semester/unit。
//
// 【为什么要单独一个文件】
//   这个格式此前在三个地方各写了一份：
//     · lib/kb.js        —— 单元查表
//     · lib/quantity.js  —— "这次背多少"的记忆键
//     · lib/srs/schedule.js —— 考试范围匹配
//   它们**必须产出一模一样的字符串**：学生选的单元、"这次背多少"的记忆、
//   考试范围，三者用的是同一个键。三份拷贝 = 改一处、另外两处悄悄失效。
//   现在只有这一份。
//
// 【为什么不能放进 kb.js 或 quantity.js】
//   lib/kb.js 是服务端模块（用 readFileSync），lib/quantity.js 是客户端模块，
//   两边都要用这个格式 —— 所以本模块刻意【零依赖、不碰 fs】，谁都能安全 import。
// ============================================================

/**
 * @param {number|string} grade 7 | 8 | 9
 * @param {number|string} semester 1 | 2
 * @param {number|string} unit 单元号
 * @returns {string} 形如 "7-1-1"
 */
export function unitKey(grade, semester, unit) {
  return `${grade}-${semester}-${unit}`;
}

/**
 * 直接从 words.json 的词条对象取单元键。
 * @param {{grade:*, semester:*, unit:*}} w 词条
 * @returns {string}
 */
export function unitKeyOf(w) {
  return unitKey(w.grade, w.semester, w.unit);
}

/**
 * (年级, 学期) 对应哪一册："7A" / "8B"。认不出来返回 null。
 *
 * 原来这份映射写在 lib/corpus.js 里（语料按册懒加载要用），而 T20/T21 出题
 * 也要按"册"筛 —— 两处各写一份就迟早对不上，所以收到本模块统一。
 * lib/corpus.js 改成从这里 import（对外仍然 re-export，调用方不用动）。
 *
 * @param {number|string} grade 7 | 8 | 9
 * @param {number|string} semester 1 | 2
 * @returns {string|null}
 */
export function bookSlot(grade, semester) {
  const g = Number(grade);
  const s = Number(semester);
  if (!g || (s !== 1 && s !== 2)) return null;
  return String(g) + (s === 1 ? "A" : "B");
}

/**
 * 册次的可读说法："七上"。单元标签（"七上 U3"）就是它 + 单元号。
 * @returns {string}
 */
export function bookLabel(grade, semester) {
  const g = Number(grade);
  const cn = { 7: "七", 8: "八", 9: "九" }[g] || String(grade);
  return cn + (Number(semester) === 1 ? "上" : "下");
}

export default { unitKey, unitKeyOf, bookSlot, bookLabel };
