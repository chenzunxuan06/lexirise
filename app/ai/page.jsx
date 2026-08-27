"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";

const GRADES = [
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

export default function AiPage() {
  const [data, setData] = useState(null);
  const [aiStatus, setAiStatus] = useState(null); // null=未知 true/false
  const [grade, setGrade] = useState(7);
  const [semester, setSemester] = useState(null);
  const [unit, setUnit] = useState(null);
  const [summary, setSummary] = useState(null); // 复习包数据
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSheet, setShowSheet] = useState(false);

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiStatus(!!d.configured))
      .catch(() => setAiStatus(false));
  }, []);

  const words = data ? data.words : [];

  const semesters = useMemo(() => {
    if (!data || !grade) return [];
    const s = new Set();
    data.words.forEach((w) => {
      if (w.grade === grade && w.semester) s.add(w.semester);
    });
    return [...s].sort((a, b) => a - b);
  }, [data, grade]);

  const units = useMemo(() => {
    if (!data || !grade || !semester) return [];
    const s = new Set();
    data.words.forEach((w) => {
      if (w.grade === grade && w.semester === semester && w.unit) s.add(w.unit);
    });
    return [...s].sort((a, b) => a - b);
  }, [data, grade, semester]);

  async function generate() {
    if (!unit || busy) return;
    setBusy(true);
    setError("");
    setSummary(null);
    setShowSheet(false);
    try {
      const r = await fetch("/api/ai/unit-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, semester, unit }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "生成失败");
      setSummary(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function printSheet() {
    setShowSheet(true);
    setTimeout(() => {
      window.print();
      setShowSheet(false);
    }, 350);
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>AI 学习中心</h1>
          <span className="en">AI Study</span>
        </div>
        <p className="tagline">
          单元复习包 · AI 重点词例句 · 可打印听写单 · 知识导图
          {aiStatus === true && <span className="tagline-dot">✨ AI 已启用</span>}
          {aiStatus === false && <span className="tagline-dot">AI 未配置（管理员设置 API key 后启用）</span>}
        </p>
      </header>

      <div className="screen-only">
        {aiStatus === false && (
          <div className="ai-block hint">
            ⚙️ AI 服务未配置：复习包仍可生成（重点词/听写单/导图来自词库真数据），仅 AI 例句与复习建议暂缺。
            管理员在服务器环境变量设置 LLM_API_KEY 后自动启用。
          </div>
        )}

        <div className="setup-card">
          <div className="section-row">
            <h2 className="section-h">📦 单元复习包</h2>
            <span className="section-sub">每天生成一次 · 全站缓存共享</span>
          </div>

          <div className="setup-label">① 选择年级</div>
          <div className="tabs">
            {GRADES.map((g) => (
              <button
                key={g.value}
                className={"tab" + (grade === g.value ? " active" : "")}
                onClick={() => {
                  setGrade(g.value);
                  setSemester(null);
                  setUnit(null);
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          {semesters.length > 0 && (
            <>
              <div className="setup-label">② 选择册</div>
              <div className="tabs">
                {semesters.map((s) => (
                  <button
                    key={s}
                    className={"tab" + (semester === s ? " active" : "")}
                    onClick={() => {
                      setSemester(s);
                      setUnit(null);
                    }}
                  >
                    {s === 1 ? "上册" : "下册"}
                  </button>
                ))}
              </div>
            </>
          )}

          {semester && (
            <>
              <div className="setup-label">③ 选择单元（复习包内容 = 该单元全部词条）</div>
              <div className="chips">
                {units.map((u) => (
                  <button
                    key={u}
                    className={"chip" + (unit === u ? " on" : "")}
                    onClick={() => setUnit(u)}
                  >
                    Unit {u}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="setup-foot">
            {error && <div className="auth-error">{error}</div>}
            <button className="start-btn" disabled={!unit || busy} onClick={generate}>
              {busy ? "⏳ 生成中（约 30 秒）…" : "生成复习包 →"}
            </button>
          </div>
        </div>

        {summary && (
          <>
            {summary.ai_error && (
              <div className="ai-block error">
                ✗ AI 例句生成失败：{summary.ai_error}
                <span style={{ color: "var(--text-soft)" }}>（复习包其余内容来自词库真数据，不受影响）</span>
              </div>
            )}
            <section className="ai-section">
              <h3>📝 复习建议</h3>
              <div className="ai-intro">
                {summary.intro || "（暂无复习建议）"}
              </div>
            </section>

            {summary.key_words.length > 0 && (
              <section className="ai-section">
                <div className="section-row">
                  <h3>⭐ 重点词汇 · AI 例句</h3>
                  <div className="review-actions">
                    <button className="ghost-btn small-btn no-sheet" onClick={printSheet}>
                      🖨️ 打印听写单
                    </button>
                  </div>
                </div>
                <div className="summary-words">
                  {summary.key_words.map((k) => (
                    <div className="summary-word" key={k.word}>
                      <div className="summary-word-head">
                        <b>{k.word}</b>
                        <span className="badge">{k.sentence_en ? "AI 例句" : ""}</span>
                      </div>
                      <div className="summary-word-sent">
                        {k.sentence_en}
                        {k.sentence_zh && <span className="zh"> · {k.sentence_zh}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="ai-section">
              <div className="section-row">
                <h3>🧠 知识导图</h3>
                <span className="section-sub">{summary.unit.label} · 共 {summary.words.length} 词</span>
              </div>
              <div className="map-tree">
                <details className="map-branch" open>
                  <summary>📚 核心词汇（{summary.mindmap.core_words.length}）</summary>
                  <div className="map-body">
                    <div className="map-chip-list">
                      {summary.mindmap.core_words.map((w) => (
                        <span className="map-chip" key={w.word} title={`${w.phonetic || ""} ${w.definition_zh}`}>
                          {w.word}
                          <small>{w.phonetic || ""}</small>
                        </span>
                      ))}
                    </div>
                  </div>
                </details>

                {summary.mindmap.affix_families.length > 0 && (
                  <details className="map-branch" open>
                    <summary>🧩 词根词缀族（{summary.mindmap.affix_families.length}）</summary>
                    <div className="map-body">
                      {summary.mindmap.affix_families.map((f) => (
                        <div key={f.family} style={{ marginBottom: 8 }}>
                          <b style={{ color: "var(--primary-dark)" }}>{f.family}</b>
                          <div className="map-chip-list" style={{ marginTop: 4 }}>
                            {f.words.map((w) => (
                              <span className="map-chip" key={w.word} title={w.hint || w.definition_zh}>
                                {w.word}
                                <small>{w.definition_zh}</small>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {summary.mindmap.hinted_others.length > 0 && (
                  <details className="map-branch">
                    <summary>🧩 其他词根提示（{summary.mindmap.hinted_others.length}）</summary>
                    <div className="map-body">
                      <div className="map-chip-list">
                        {summary.mindmap.hinted_others.map((w) => (
                          <span className="map-chip" key={w.word} title={w.hint}>
                            {w.word}
                            <small>{w.hint}</small>
                          </span>
                        ))}
                      </div>
                    </div>
                  </details>
                )}

                {summary.mindmap.phrases.length > 0 && (
                  <details className="map-branch" open>
                    <summary>💬 短语搭配（{summary.mindmap.phrases.length}）</summary>
                    <div className="map-body">
                      <div className="map-chip-list">
                        {summary.mindmap.phrases.map((p) => (
                          <span className="map-chip" key={p.word} title={p.definition_zh}>
                            {p.word}
                            <small>{p.definition_zh}</small>
                          </span>
                        ))}
                      </div>
                    </div>
                  </details>
                )}

                {summary.mindmap.confusables.length > 0 && (
                  <details className="map-branch" open>
                    <summary>⚠️ 易混考点（{summary.mindmap.confusables.length}）</summary>
                    <div className="map-body">
                      {summary.mindmap.confusables.map((c) => (
                        <div className="map-pair" key={`${c.a}-${c.b}`}>
                          <b>{c.a} / {c.b}</b>
                          {c.note}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>

            <section className="ai-section" style={{ paddingBottom: 60 }}>
              <div className="section-row">
                <h3>📋 全部词汇（{summary.words.length}）</h3>
              </div>
              <div className="cards">
                {summary.words.map((w) => (
                  <div className="word-card" key={w.id || w.word}>
                    <div className="w">{w.word}</div>
                    <div className="ph">{w.phonetic || "（无音标）"}</div>
                    <div className="def">{w.definition_zh}</div>
                    {w.affix_hint && <div className="affix-dot-line">🧩 {w.affix_hint}</div>}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* 听写单（打印时独占一页） */}
      {showSheet && summary && (
        <div className="dict-sheet">
          <div className="dict-sheet-head">
            <h2>英语听写单 · {summary.unit.label}</h2>
            <p>姓名：＿＿＿＿＿＿＿＿　日期：＿＿＿＿＿＿＿＿　得分：＿＿／{summary.dictation.length}</p>
          </div>
          <table className="dict-table">
            <tbody>
              {summary.dictation.map((d) => (
                <tr key={d.no}>
                  <td className="num">{d.no}</td>
                  <td className="zh">{d.definition_zh}</td>
                  <td className="blank"></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dict-sheet-head" style={{ marginTop: 20 }}>
            <p>答案：{summary.dictation.map((d) => d.word).join("、")}</p>
          </div>
        </div>
      )}
    </div>
  );
}