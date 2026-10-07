"use client";

// ============================================================
// app/compare/page.jsx —— 对比视图（T12）
// ------------------------------------------------------------
// 同一批词、同一份记忆状态、同一个考试范围，两种调度各选一遍：
//   左：普通做法（按到期时间排序，完全不知道考试范围）
//   右：词跃（截止约束调度，优先范围内该考的）
//
// 设计意图：评委不需要懂算法，只要看到左边一片灰、右边一片绿。
// 所以刻意用【色块】而不是表格 —— 表格只有数字，记不住。
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { memory } from "@/lib/memory";
import { compareMetrics } from "@/lib/srs/compare";
import { describeScope } from "@/lib/goal";
import { unitKeyOf } from "@/lib/units";
import { demoStates } from "@/lib/srs/demo";

const T = {
  ink: "var(--ink)",
  soft: "var(--soft)",
  faint: "var(--faint)",
  edge: "var(--edge)",
  hair: "var(--hair)",
  fox: "var(--fox)",
  foxInk: "var(--fox-ink)",
  paper: "var(--paper)",
  surface: "var(--surface)",
  green: "var(--seal-g)",
};

// 对比必须【同预算】：两边都选 20 个，差异才纯粹来自"选了哪些词"。
// 所以这里 newMax 放开到 count —— 产品里的"每天最多几个新词"是另一回事，
// 放进对比会变成"20 个 vs 5 个"，反而看不出调度的差别。
// dueMin：到期词保底。没有它，范围外的到期词会被永远压住（见 lib/srs/schedule.js 的说明）
const BUDGET = { count: 20, newMax: 20, dueMin: 6 };

export default function ComparePage() {
  const [data, setData] = useState(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    loadWords().then(setData).catch(() => {});
  }, []);

  // ?demo=1 → 用演示学生状态（只存在内存里，不写 localStorage）。
  // 空账号下两种调度看不出差别，演示/答辩必须用它。
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(new URLSearchParams(window.location.search).get("demo") === "1");
  }, []);

  const words = useMemo(() => data?.words || [], [data]);
  const states = useMemo(
    () => (demo ? demoStates(words, now) : memory.load()),
    [data, demo, words, now]
  );
  const scope = useMemo(() => describeScope(words, states), [words, states]);
  const byId = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const scopeSet = useMemo(() => new Set(scope.units), [scope]);

  const m = useMemo(() => {
    if (!words.length) return null;
    return compareMetrics(words, states, { now, units: scope.units }, BUDGET);
  }, [words, states, now, scope]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 64px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px", color: T.ink }}>对比：同一批词，两种选法</h1>
      <p style={{ color: T.soft, fontSize: 14, margin: "0 0 6px" }}>
        范围：<b style={{ color: T.foxInk }}>{scope.label}</b>
        {scope.inferred && <span style={{ color: T.faint }}>（按进度推断）</span>}
        　·　每次选 {BUDGET.count} 个词
      </p>

      {demo && (
        <div
          style={{
            display: "inline-block",
            fontSize: 12.5,
            color: "var(--seal)",
            border: "1px solid var(--seal)",
            borderRadius: 999,
            padding: "2px 12px",
            marginBottom: 12,
          }}
        >
          演示数据 —— 造了一个「七年级上、学到 Unit 3」的学生，不是真实用户数据
        </div>
      )}

      <div style={{ fontSize: 12, color: T.faint, marginBottom: 18 }}>
        <span style={{ display: "inline-block", width: 12, height: 12, background: T.fox, borderRadius: 3, verticalAlign: -1, marginRight: 5 }} />
        在考试范围内
        <span style={{ display: "inline-block", width: 12, height: 12, background: T.hair, borderRadius: 3, verticalAlign: -1, margin: "0 5px 0 16px" }} />
        不在范围内
      </div>

      {!data && <div style={{ color: T.faint }}>正在加载词库…</div>}

      {m && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Column
              title="普通做法"
              subtitle="按到期时间排序"
              note="它不知道你下周三要考什么"
              ids={m.baseline.ids}
              byId={byId}
              scopeSet={scopeSet}
              tone="plain"
            />
            <Column
              title="词跃"
              subtitle="截止约束调度"
              note="优先范围内该考的，再说别的"
              ids={m.constrained.ids}
              byId={byId}
              scopeSet={scopeSet}
              tone="fox"
            />
          </div>

          {/* ---------- 数字 ---------- */}
          <div
            style={{
              marginTop: 20,
              background: T.surface,
              border: `1px solid ${T.edge}`,
              borderRadius: "var(--radius)",
              padding: "16px 18px",
            }}
          >
            <Row
              label="选中的词里，在考试范围内的"
              left={`${m.baseline.inScope} / ${m.baseline.ids.length}`}
              right={`${m.constrained.inScope} / ${m.constrained.ids.length}`}
              better={m.constrained.inScope > m.baseline.inScope}
            />
            <Row
              label="还剩多少到期的没做（积压）"
              left={`${m.backlog.baseline} 个`}
              right={`${m.backlog.constrained} 个`}
              better={m.backlog.constrained < m.backlog.baseline}
            />
            <Row label="到期总数" left={`${m.backlog.dueTotal} 个`} right={`${m.backlog.dueTotal} 个`} />
            <div style={{ fontSize: 12, color: T.faint, marginTop: 10, lineHeight: 1.7 }}>
              「普通做法」是现行行为的忠实简化模型：按到期时间升序，不足用新词补齐。
              它的关键特征被完整保留 —— <b>完全不知道考试范围</b>。
              <br />
              <b style={{ color: T.foxInk }}>这是一个权衡，不是全面获胜：</b>
              词跃把预算挪给了考试范围内的词，代价是清掉的到期词更少、积压更多。
              所以调度器留了「到期词保底」（本次 {BUDGET.dueMin} 个），
              否则范围外的旧词永远排不上队、会一直烂在积压里。
              <br />
              刻意没写「保持率提升百分之几」：那需要先有答题日志校准过的遗忘模型，
              在拿到数据之前不编数字。
            </div>
          </div>

          <div style={{ marginTop: 18, fontSize: 14, display: "flex", gap: 18, flexWrap: "wrap" }}>
            <a href="/plan" style={{ color: T.foxInk }}>
              ← 回到备考计划
            </a>
            <a href="/evidence" style={{ color: T.foxInk }}>
              看证据：仿真里差多少 →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/** 一列色块。每格一个词，颜色表示在不在考试范围内。 */
function Column({ title, subtitle, note, ids, byId, scopeSet, tone }) {
  const inScopeCount = ids.filter((id) => {
    const w = byId.get(id);
    return w && scopeSet.has(unitKeyOf(w));
  }).length;

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${tone === "fox" ? T.fox : T.edge}`,
        borderRadius: "var(--radius)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, color: tone === "fox" ? T.foxInk : T.ink }}>{title}</div>
          <div style={{ fontSize: 12, color: T.faint }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 20, color: tone === "fox" ? T.foxInk : T.soft }}>
          {inScopeCount}<span style={{ fontSize: 12, color: T.faint }}> / {ids.length}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.faint, margin: "6px 0 10px" }}>{note}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {ids.map((id) => {
          const w = byId.get(id);
          if (!w) return null;
          const inScope = scopeSet.has(unitKeyOf(w));
          return (
            <div
              key={id}
              title={`${w.word_en}　${w.definition_zh}`}
              style={{
                background: inScope ? T.fox : T.hair,
                color: inScope ? "#fff" : "var(--ink)",
                borderRadius: 4,
                padding: "6px 4px",
                fontSize: 12,
                textAlign: "center",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: inScope ? 1 : 0.55,
              }}
            >
              {String(w.word_en).replace(/^\*/, "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 一行对比数字 */
function Row({ label, left, right, better }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1fr 1fr",
        gap: 10,
        padding: "7px 0",
        borderBottom: `1px solid ${T.hair}`,
        alignItems: "baseline",
      }}
    >
      <span style={{ fontSize: 13, color: T.soft }}>{label}</span>
      <span style={{ fontSize: 14, color: T.soft, textAlign: "right" }}>{left}</span>
      <span
        style={{
          fontSize: 15,
          textAlign: "right",
          color: better ? T.green : T.ink,
          fontWeight: better ? 600 : 400,
        }}
      >
        {right}
      </span>
    </div>
  );
}
