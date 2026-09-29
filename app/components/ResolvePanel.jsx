"use client";

// ============================================================
// app/components/ResolvePanel.jsx —— 统一结算（方向C 阶段 6）
// ------------------------------------------------------------
// 首批（背书 + 复习共用，无正确率）：印章位 + KPI + 清空清单 + 三去向
// 次批（训练 + 测验，有正确率）：分数 + 每题对错 + 错题清单
// ⚠️ 这是全站唯一的结算样式，五个流程从这里取；热闹只留给完成这一刻
// ============================================================

import Link from "next/link";
import { RRow, StBar } from "./rows";

/**
 * props:
 *   kind "self"（背书/复习：自评两档，不判对错） | "judge"（训练/测验：判定对错）
 *   stamp  印章文字（如 "本片完成 10/12" / "正确率 78%"）
 *   stampTone "fin" | "normal"
 *   kpis   [{label, value}]
 *   list   [{word, mark, def, tag, cls}]
 *   title  清单标题（可选）
 *   actions [{label, href, primary, onClick}]  去向
 */
export default function ResolvePanel({ kind = "self", stamp, stampTone = "fin", kpis = [], list = [], title, actions = [] }) {
  return (
    <div className={"bs-resolve " + (kind === "judge" ? " judge" : "")}>
      <StBar
        variant={stampTone === "fin" ? "fin" : "normal"}
        icon="▶"
        title={stamp}
        desc={
          kind === "judge"
            ? "答错的词已进错题本，连对 2 次就消灭它"
            : "记不住的词已进错题本，下次还会遇到"
        }
      />

      {kpis.length > 0 && (
        <div className="bs-kpis">
          {kpis.map((k, i) => (
            <div key={i} className="bs-kpi">
              <b>{k.value}</b>
              <span>{k.label}</span>
            </div>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="bs-resolve-list">
          <div className="bs-resolve-list-h">
            {title || (kind === "judge" ? "错题清单（连对 2 次消灭）" : "不认识的词（已进错题本）")}
          </div>
          {list.slice(0, 12).map((it, i) => (
            <RRow
              key={i}
              word={it.word}
              mark={it.mark}
              markCls={it.cls || (it.mark === "错" || it.mark === "不认识" ? "no" : it.mark === "未作答" ? "miss" : "ok")}
              def={it.def}
              tag={it.tag}
            />
          ))}
          {list.length > 12 && <div className="bs-resolve-more">还有 {list.length - 12} 条</div>}
        </div>
      )}

      <div className="bs-resolve-acts">
        {actions.map((a, i) =>
          a.href ? (
            <Link
              key={i}
              className={"bs-resolve-btn" + (a.primary ? " primary" : "")}
              href={a.href}
              onClick={a.onClick}
            >
              {a.label}
            </Link>
          ) : a.onClick ? (
            <button
              key={i}
              className={"bs-resolve-btn" + (a.primary ? " primary" : "")}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}
