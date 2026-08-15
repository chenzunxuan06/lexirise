"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadWords } from "@/lib/loadWords";
import { speak, speakSlow } from "@/lib/tts";
import { memory, wrongBook, stats } from "@/lib/memory";
import ExampleBlock from "../components/ExampleBlock";

const GRADES = [
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

export default function RecitePage() {
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState(7);
  const [semester, setSemester] = useState(null); // 1 上 / 2 下
  const [phase, setPhase] = useState("choose"); // choose | running | done
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [knownCount, setKnownCount] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
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
    const map = new Map();
    data.words.forEach((w) => {
      if (w.grade === grade && w.semester === semester && w.unit) {
        if (!map.has(w.unit)) map.set(w.unit, []);
        map.get(w.unit).push(w);
      }
    });
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([unit, ws]) => ({
        unit,
        words: ws.sort((a, b) => a.id - b.id),
      }));
  }, [data, grade, semester]);

  function unitLearned(ws) {
    const m = memory.load();
    let n = 0;
    ws.forEach((w) => {
      if (m[w.id] && m[w.id].lv > 0) n += 1;
    });
    return n;
  }

  function startUnit(ws) {
    setDeck(ws);
    setIdx(0);
    setRevealed(false);
    setKnownCount(0);
    setPhase("running");
  }

  const cur = deck[idx];

  // 自动朗读
  useEffect(() => {
    if (phase === "running" && cur && autoSpeak) {
      const t = setTimeout(() => speak(cur.word_en), 300);
      return () => clearTimeout(t);
    }
  }, [idx, phase, autoSpeak, cur]);

  function mark(ok) {
    if (!cur) return;
    const w = cur;
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew);
    if (!ok) wrongBook.add(w.id);
    stats.add({ n: isNew ? 1 : 0, review: isNew ? 0 : 1, correct: ok ? 1 : 0, total: 1 });
    if (ok) setKnownCount((k) => k + 1);
    setTick((t) => t + 1);
    if (idx + 1 >= deck.length) {
      setPhase("done");
    } else {
      setIdx(idx + 1);
      setRevealed(false);
    }
  }

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  const totalWords = units.reduce((s, u) => s + u.words.length, 0);

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>背书</h1>
          <span className="en">Recite by Unit</span>
        </div>
        <p className="tagline">
          按 <b>年级 → 学期 → 单元</b> 逐词背诵 · 教材原序 · 自动朗读 · 进度记入记忆曲线
        </p>
      </header>

      {/* ---------- 选择阶段 ---------- */}
      {phase === "choose" && (
        <>
          <div className="setup-card">
            <div className="setup-label">① 选择年级</div>
            <div className="tabs">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  className={"tab" + (grade === g.value ? " active" : "")}
                  onClick={() => {
                    setGrade(g.value);
                    setSemester(null);
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {semesters.length > 0 && (
              <>
                <div className="setup-label">② 选择学期</div>
                <div className="semester-grid">
                  {semesters.map((s) => (
                    <button
                      key={s}
                      className={"semester-card" + (semester === s ? " active" : "")}
                      onClick={() => setSemester(s)}
                    >
                      <span className="semester-card-name">
                        {s === 1 ? "上册" : "下册"}
                      </span>
                      <span className="semester-card-en">
                        {grade === 7 ? "Grade 7" : grade === 8 ? "Grade 8" : "Grade 9"} · {s === 1 ? "A" : "B"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {semester && (
              <>
                <div className="setup-label">
                  ③ 选择单元（{semester === 1 ? "上册" : "下册"} · 共 {totalWords} 词）
                </div>
                <div className="recite-units">
                  {units.map((u) => {
                    const learned = unitLearned(u.words);
                    const pct = Math.round((learned / u.words.length) * 100);
                    return (
                      <div className="recite-unit" key={u.unit}>
                        <div className="recite-unit-info">
                          <div className="recite-unit-title">Unit {u.unit}</div>
                          <div className="recite-unit-count">
                            {u.words.length} 词 · 已背 {learned}
                          </div>
                          <div className="recite-unit-bar">
                            <div className="recite-unit-fill" style={{ width: pct + "%" }} />
                          </div>
                        </div>
                        <button className="start-btn" onClick={() => startUnit(u.words)}>
                          开始背诵 →
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {!semester && (
            <div className="empty-state">
              {semesters.length === 0
                ? "该年级暂无词库数据"
                : "先选一个学期，再选单元开始背诵"}
            </div>
          )}
        </>
      )}

      {/* ---------- 背诵阶段 ---------- */}
      {phase === "running" && cur && (
        <div className="train-run">
          <div className="recite-top">
            <div className="recite-title">
              {grade}年级 {semester === 1 ? "上" : "下"}册 · Unit {cur.unit}
            </div>
            <label className="auto-speak">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
              />
              自动朗读
            </label>
          </div>
          <div className="progress">
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{ width: ((idx / deck.length) * 100) + "%" }}
              />
            </div>
            <span className="progress-text">
              第 {idx + 1} / {deck.length} 词
            </span>
          </div>

          <div className="recite-card">
            <div className="recite-word">
              {cur.word_en}
              <button className="speak" onClick={() => speak(cur.word_en)} title="朗读">🔊</button>
              <button className="speak slow" onClick={() => speakSlow(cur.word_en)} title="慢速">🐢</button>
            </div>
            {cur.phonetic && <div className="run-phon">{cur.phonetic}</div>}

            {!revealed ? (
              <button className="reveal-btn" onClick={() => setRevealed(true)}>
                点击显示释义 👁
              </button>
            ) : (
              <div className="recite-reveal">
                <div className="recite-def">
                  {cur.pos ? <span className="badge">{cur.pos}</span> : null}
                  <span>{cur.definition_zh}</span>
                </div>
                {cur.affix_hint && <div className="fb-ex">🧩 {cur.affix_hint}</div>}
                <ExampleBlock w={cur} compact />
              </div>
            )}

            <div className="recite-actions">
              <button className="known-no" onClick={() => mark(false)}>
                ✗ 不认识
              </button>
              <button
                className="reveal-btn inline"
                onClick={() => setRevealed(true)}
                disabled={revealed}
              >
                显示释义
              </button>
              <button className="known-yes" onClick={() => mark(true)}>
                认识了 ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 完成阶段 ---------- */}
      {phase === "done" && (
        <div className="train-done">
          <h2 className="section-h">本单元背诵完成 🎉</h2>
          <div className="done-card">
            <div className="done-score">
              {knownCount}
              <span> / {deck.length}</span>
            </div>
            <div className="done-label">
              认识率 {deck.length ? Math.round((knownCount / deck.length) * 100) : 0}%
              {deck.length - knownCount > 0 && (
                <span className="done-extra">
                  还有 {deck.length - knownCount} 个不认识的词，已自动进入错题本
                </span>
              )}
            </div>
            <div className="done-actions">
              <button className="start-btn" onClick={() => startUnit(deck)}>
                再背一遍
              </button>
              <Link
                className="ghost-btn"
                href={`/exam?grade=${grade}&semester=${semester}&unit=${cur ? cur.unit : 1}`}
              >
                测验本单元 →
              </Link>
              <button className="ghost-btn" onClick={() => setPhase("choose")}>
                返回选单元
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
