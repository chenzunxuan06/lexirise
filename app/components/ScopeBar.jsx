"use client";

// ============================================================
// app/components/ScopeBar.jsx —— 题库页顶部的「出题范围」条
// ------------------------------------------------------------
// /cloze 与 /forms 共用。范围的解析与筛选在 lib/bank.js，这里只负责画。
//
// 三个层次一眼看得懂：
//   [六册混合]  按单元练 →            ← 不带参数（改动前的老行为）
//   [七上 · 整册]  U1 U2 U3 …  练全册  ← 带 grade/semester
//   [七上 U3]      U1 U2 U3 …  练全册  ← 再带 unit
//
// 单元后面那个小数字 = 范围内该单元有几道题（数据来自题库本身，
// 不额外请求 words.json）。**不显示整册总题数** —— 那个数不可行动。
// ============================================================

import Link from "next/link";
import { scopeText, scopeHref } from "@/lib/bank";

/**
 * @param {object|null} scope parseScope() 的结果
 * @param {Array} units unitOptions() 的结果
 * @param {string} base 本页路径（"/cloze" / "/forms"）
 * @param {string} allHref 「练全册」去哪（一般就是 base，不带参数）
 */
export default function ScopeBar({ scope, units = [], base, allHref }) {
  return (
    <div className="fm-scope">
      <span className="fm-scope-tag">{scopeText(scope)}</span>

      {units.length > 1 && (
        <span className="fm-scope-units">
          {units.map((u) => (
            <Link
              key={u.key}
              href={scopeHref(base, scope, u.unit)}
              className={"fm-chip" + (scope && scope.key === u.key ? " on" : "")}
            >
              {u.label}
              <i>{u.n}</i>
            </Link>
          ))}
        </span>
      )}

      <Link className="fm-scope-x" href={scope ? allHref : "/"}>
        {scope ? "练全册" : "按单元练"}
      </Link>
    </div>
  );
}
