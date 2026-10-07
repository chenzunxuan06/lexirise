"use client";

// ============================================================
// app/components/ResolvePanel.jsx —— 统一结算（方向C 阶段 6）
// ------------------------------------------------------------
// 首批（背书 + 复习共用，无正确率）：印章位 + KPI + 清空清单 + 三去向
// 次批（训练 + 测验，有正确率）：分数 + 每题对错 + 错题清单
// ⚠️ 这是全站唯一的结算样式，五个流程从这里取；热闹只留给完成这一刻
//
// 【2026-10-05 加：收工那一声】
//   用户定的设计：
//     · 不同的话、带他的名字（「你今天很厉害了」「你今天做的好快呀」）
//     · 后面必须跟一件**可核实的事实**（空的「真棒」没有分量）
//     · 参照物是**昨天的自己**，不是别人（排行榜不做）
//   接在这里的理由和 ExampleBlock 一样：**全站唯一的收工屏，一个改动点，四个流程全覆盖**。
//   具体文案在 lib/praise.js，要改只改那一个文件。
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RRow, StBar } from "./rows";
import { praiseFor } from "@/lib/praise";
import { sync } from "@/lib/sync";
import { stats } from "@/lib/memory";

/** 从 KPI 里把"这一轮做到什么样"抽出来。抽不到就退回只有招呼、没有事实。 */
function shapeOf(kpis) {
  const num = (label) => {
    const k = (kpis || []).find((x) => x && x.label === label);
    if (!k) return null;
    const n = Number(String(k.value).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const correct = num("答对");
  const wrong = num("答错");
  const kept = num("记得住");
  const forgot = num("忘了");
  const cleared = num("消灭错词");
  if (correct !== null && wrong !== null) return { total: correct + wrong, correct, cleared: cleared || 0 };
  if (kept !== null && forgot !== null) return { total: kept + forgot, correct: kept, cleared: cleared || 0 };
  return { total: 0, correct: 0, cleared: cleared || 0 };
}

/**
 * props:
 *   kind "self"（背书/复习：自评两档，不判对错） | "judge"（训练/测验：判定对错）
 *   stamp  印章文字（如 "本片完成 10/12" / "正确率 78%"）
 *   stampTone "fin" | "normal"
 *   kpis   [{label, value}]
 *   list   [{word, mark, def, tag, cls}]
 *   title  清单标题（可选）
 *   actions [{label, href, primary, onClick}]  去向
 *   praiseCtx 可选，覆盖/补充自动推断出的那一轮数据 { total, correct, cleared, streak, firstToday }
 */
export default function ResolvePanel({
  kind = "self",
  stamp,
  stampTone = "fin",
  kpis = [],
  list = [],
  title,
  actions = [],
  praiseCtx,
}) {
  // 水合安全：SSR 首帧不读 localStorage（本项目既有做法）
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  useEffect(() => {
    setMounted(true);
    sync
      .init()
      .then(() => setUser(sync.user))
      .catch(() => {});
  }, []);

  const praise = useMemo(() => {
    if (!mounted) return null;
    const c = { ...shapeOf(kpis), ...(praiseCtx || {}) };
    let streak = c.streak;
    let yesterday = 0;
    let todayTotal = 0;
    try {
      if (streak === undefined) streak = stats.streakDays();
      const d = stats.days(2);
      if (d && d.length === 2) {
        yesterday = d[0].total || 0;
        todayTotal = d[1].total || 0;
      }
    } catch {
      /* 隐私模式等：退化成没有事实那一行 */
    }
    return praiseFor({
      name: user ? user.nickname || user.username : "",
      kind,
      total: c.total,
      correct: c.correct,
      cleared: c.cleared,
      streak,
      firstToday: c.firstToday,
      yesterday,
      todayTotal,
    });
  }, [mounted, user, kind, kpis, praiseCtx]);

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

      {praise && (praise.hello || praise.fact) && (
        <div className="bs-praise">
          {praise.hello ? <div className="bs-praise-hello">{praise.hello}</div> : null}
          {praise.fact ? <div className="bs-praise-fact">{praise.fact}</div> : null}
        </div>
      )}

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
