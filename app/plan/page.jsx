"use client";

// ============================================================
// app/plan/page.jsx —— 备考计划（T07 目标输入 + T11 分组计划 + 理由卡）
// ------------------------------------------------------------
// 这一屏是作品的核心：把"下周三要听写什么"变成"今晚练哪些词"，
// 并且每个词都能说清"为什么是它"。
//
// 数据流：
//   words.json + 记忆状态
//     → describeScope()  取考试范围（没设目标时按学生进度推断）
//     → schedule()       截止约束调度（lib/srs/schedule.js）
//     → groupPlan()      分三组 + 每个词的可核实理由（lib/srs/explain.js）
//
// 设计纪律（方向C-落地计划-v8）：
//   · 只给可行动的数字（今晚几个），不给总账（全库多少个）
//   · 解释只来自四类【可核实】来源：教材 / 你的历史 / 时间 / 结构
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { memory } from "@/lib/memory";
import { schedule } from "@/lib/srs/schedule";
import { groupPlan, unitLabel } from "@/lib/srs/explain";
import { readGoal, saveGoal, clearGoal, describeScope } from "@/lib/goal";
import { unitKeyOf } from "@/lib/units";
import { corpusForWords } from "@/lib/corpus";
import { speak } from "@/lib/tts";

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
  red: "var(--seal)",
};

const CARD = {
  background: T.surface,
  border: `1px solid ${T.edge}`,
  borderRadius: "var(--radius)",
  padding: "14px 16px",
};

const CHIP = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${T.edge}`,
  borderRadius: 999,
  padding: "5px 12px",
  fontSize: 14,
  background: T.paper,
  cursor: "pointer",
};

/** 把 "YYYY-MM-DD" 变成当天 08:00 的时间戳（听写一般早上） */
function dateToTs(s) {
  if (!s) return 0;
  const d = new Date(s + "T08:00:00");
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function tsToDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PlanPage() {
  const [data, setData] = useState(null);
  const [goal, setGoal] = useState(null);
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch(() => {});
    setGoal(readGoal());
  }, []);

  const words = useMemo(() => data?.words || [], [data]);
  const states = useMemo(() => memory.load(), [data, tick]);

  // 全部单元（按册分组，供选择器用）
  const books = useMemo(() => {
    const m = new Map();
    for (const w of words) {
      if (w.entry_type !== "word") continue;
      const k = unitKeyOf(w);
      const bookKey = `${w.grade}-${w.semester}`;
      if (!m.has(bookKey)) {
        const cn = { 7: "七", 8: "八", 9: "九" }[w.grade] || w.grade;
        m.set(bookKey, { key: bookKey, label: `${cn}${w.semester === 1 ? "上" : "下"}`, units: [] });
      }
      const b = m.get(bookKey);
      if (!b.units.some((u) => u.key === k)) b.units.push({ key: k, label: `U${w.unit}` });
    }
    return [...m.values()];
  }, [words]);

  const scope = useMemo(() => describeScope(words, states), [words, states, goal, tick]);

  // 调度先算出来（下面取课本原句要知道"选中了哪几个词"）
  const scheduled = useMemo(() => {
    if (!words.length) return null;
    return schedule(
      words,
      states,
      { now: Date.now(), units: scope.units },
      { count: 20, newMax: 5, dueMin: 6 }
    );
  }, [words, states, scope]);

  // 课本原句（T18）：**只给真正选中的那 20 个词取**，不整库加载 4 册语料。
  // 这也是 app/plan 页第一次用上 explain() 里预留的 "corpus" 扩展位。
  const [corpus, setCorpus] = useState(null);
  useEffect(() => {
    if (!scheduled) {
      setCorpus(null);
      return undefined;
    }
    const byId = new Map(words.map((w) => [w.id, w]));
    const picked = (scheduled.ordered || []).map((id) => byId.get(id)).filter(Boolean);
    let alive = true;
    corpusForWords(picked, { limit: 1 }).then((m) => {
      if (!alive) return;
      const flat = {};
      for (const k of Object.keys(m)) {
        // 只要真句子：vocab 那条是「课本词汇表」出处（text 故意为空），这里不渲染它
        if (m[k] && m[k][0] && !m[k][0].vocab) flat[k] = { text: m[k][0].text, source: m[k][0].source };
      }
      setCorpus(flat);
    });
    return () => {
      alive = false;
    };
  }, [scheduled, words]);

  const plan = useMemo(() => {
    if (!scheduled) return null;
    return groupPlan(words, states, scheduled, { scopeLabel: scope.label, corpus });
  }, [words, states, scheduled, scope, corpus]);

  function onSaveGoal(g) {
    saveGoal(g);
    setGoal(readGoal());
    setEditing(false);
    setTick((t) => t + 1);
  }
  function onClearGoal() {
    clearGoal();
    setGoal(null);
    setEditing(false);
    setTick((t) => t + 1);
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px 64px" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px", color: T.ink }}>备考计划</h1>
      <p style={{ color: T.soft, fontSize: 14, margin: "0 0 20px" }}>
        告诉系统你要考什么，它算出今晚该练哪些词 —— 每个词都说得出为什么。
      </p>

      {/* ---------- 范围 ---------- */}
      <div style={{ ...CARD, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, color: T.faint, marginBottom: 2 }}>当前范围</div>
            <div style={{ fontSize: 16, color: T.ink }}>
              {scope.label}
              {scope.inferred && (
                <span style={{ fontSize: 12, color: T.faint, marginLeft: 8 }}>（按你的进度推断）</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ ...CHIP, color: T.foxInk }} onClick={() => setEditing((v) => !v)}>
              {editing ? "收起" : goal ? "改目标" : "设置目标"}
            </button>
            {goal && (
              <button style={{ ...CHIP, color: T.soft }} onClick={onClearGoal}>
                清除
              </button>
            )}
          </div>
        </div>

        {editing && (
          <GoalForm books={books} goal={goal} onSave={onSaveGoal} onCancel={() => setEditing(false)} />
        )}
      </div>

      {/* ---------- 计划 ---------- */}
      {!data && <div style={{ color: T.faint }}>正在加载词库…</div>}
      {data && !plan?.total && (
        <div style={{ ...CARD, color: T.soft }}>这个范围里暂时没有要练的词。</div>
      )}

      {plan?.groups.map((g) => (
        <section key={g.key} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
            <h2 style={{ fontSize: 17, margin: 0, color: T.ink }}>
              {g.emoji} {g.label}
            </h2>
            <span style={{ fontSize: 15, color: T.foxInk }}>{g.words.length}</span>
          </div>
          <div style={{ fontSize: 12, color: T.faint, marginBottom: 10 }}>{g.hint}</div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {g.words.map((it) => {
              const w = it.word;
              const open = openId === w.id;
              return (
                <div key={w.id} style={{ width: "100%" }}>
                  <div
                    onClick={() => setOpenId(open ? null : w.id)}
                    style={{
                      ...CARD,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: "pointer",
                    }}
                  >
                    <b style={{ fontSize: 16, color: T.ink, minWidth: 96 }}>
                      {String(w.word_en).replace(/^\*/, "")}
                    </b>
                    <span style={{ fontSize: 13, color: T.faint, minWidth: 110 }}>{w.phonetic || ""}</span>
                    <span style={{ fontSize: 14, color: T.soft, flex: 1 }}>{w.definition_zh}</span>
                    <button
                      style={{ ...CHIP, padding: "2px 8px", background: "transparent", border: "none", fontSize: 15 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        speak(String(w.word_en).replace(/^\*/, ""));
                      }}
                      aria-label={`朗读 ${w.word_en}`}
                    >
                      🔊
                    </button>
                  </div>

                  {open && (
                    <div style={{ padding: "8px 14px 4px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {it.items
                          .filter((x) => x.kind !== "corpus")
                          .map((x, i) => (
                            <span
                              key={i}
                              style={{
                                fontSize: 13,
                                color: T.soft,
                                border: `1px solid ${T.hair}`,
                                borderRadius: 999,
                                padding: "3px 10px",
                                background: T.paper,
                              }}
                            >
                              {x.text}
                            </span>
                          ))}
                      </div>
                      {/* 课本原句不做成胶囊：一整句话塞进 pill 会挤成一团。
                          单独一行，和 ExampleBlock 的 .tb-ex 同一套观感。 */}
                      {it.items
                        .filter((x) => x.kind === "corpus")
                        .map((x, i) => (
                          <div className="tb-ex compact" key={"c" + i}>
                            <div className="en">{x.text}</div>
                            {x.source ? <div className="src">{x.source}</div> : null}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {plan?.total > 0 && (
        <div style={{ marginTop: 8, fontSize: 14 }}>
          <a href="/compare" style={{ color: T.foxInk }}>
            对比一下：普通做法会推什么 →
          </a>
        </div>
      )}
    </div>
  );
}

/** 目标输入：日期 + 类型 + 单元。刻意只留这几个字段，输入越少越可能被填。 */
function GoalForm({ books, goal, onSave, onCancel }) {
  const [date, setDate] = useState(goal ? tsToDate(goal.at) : "");
  const [kind, setKind] = useState(goal?.kind || "dictation");
  const [picked, setPicked] = useState(goal?.units || []);

  const toggle = (k) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.hair}` }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ ...CHIP, cursor: "text" }}
        />
        <select value={kind} onChange={(e) => setKind(e.target.value)} style={CHIP}>
          <option value="dictation">听写</option>
          <option value="quiz">单元测验</option>
          <option value="exam">考试</option>
        </select>
        <span style={{ fontSize: 13, color: T.faint }}>要考哪些单元 ↓</span>
      </div>

      <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12 }}>
        {books.map((b) => (
          <div key={b.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: T.faint, width: 30 }}>{b.label}</span>
            {b.units.map((u) => {
              const on = picked.includes(u.key);
              return (
                <button
                  key={u.key}
                  onClick={() => toggle(u.key)}
                  style={{
                    ...CHIP,
                    padding: "2px 10px",
                    fontSize: 13,
                    background: on ? T.fox : T.paper,
                    color: on ? "#fff" : T.soft,
                    borderColor: on ? T.fox : T.edge,
                  }}
                >
                  {u.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          style={{ ...CHIP, background: T.fox, color: "#fff", borderColor: T.fox }}
          disabled={!date || !picked.length}
          onClick={() => onSave({ at: dateToTs(date), kind, units: picked })}
        >
          保存
        </button>
        <button style={CHIP} onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
