"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { speak, speakSlow, unlockAudio } from "@/lib/tts";
import { memory, wrongBook, stats } from "@/lib/memory";
import ExampleBlock from "../components/ExampleBlock";
import GameBar from "../components/GameBar";
import ChapterHead from "../components/ChapterHead";
import PetEmpty from "../components/PetEmpty";
import ResolvePanel from "../components/ResolvePanel";

const GRADES = [
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

export default function RecitePage() {
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <PetEmpty title="加载背书…" sub="跃跃在翻书" />
        </div>
      }
    >
      <ReciteInner />
    </Suspense>
  );
}

function ReciteInner() {
  const sp = useSearchParams();
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState(7);
  const [semester, setSemester] = useState(null); // 1 上 / 2 下
  const [phase, setPhase] = useState("choose"); // choose | running | done
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [knownCount, setKnownCount] = useState(0);
  const [wrongList, setWrongList] = useState([]); // 本轮不认识的词（结算清单用）
  const [tick, setTick] = useState(0);
  const [selUnit, setSelUnit] = useState(null); // 当前选择/背诵的单元号

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

  function startUnit(ws, u, count) {
    // 用户手势内解锁音频：保证进入单元后自动朗读不被移动端自动播放策略拦
    unlockAudio();
    if (u) setSelUnit(u);
    let deckWords = ws;
    if (count && count > 0 && count < ws.length) deckWords = ws.slice(0, count);
    setDeck(deckWords);
    setIdx(0);
    setRevealed(false);
    setKnownCount(0);
    setWrongList([]);
    setPhase("running");
  }

  // URL 参数响应（修复 2026-09-16）：深链 / 切册 / 后退前进，参数一变就重建甲板，
  // 不再只在挂载时读一次（旧 bug：左栏切册后头部变了、词卡不变）
  const g = Number(sp.get("grade")) || 0;
  const s = Number(sp.get("semester")) || 0;
  const u = Number(sp.get("unit")) || 0;
  const c = Number(sp.get("count")) || 0;
  const paramsKey = `${g}/${s}/${u}/${c}`;
  const lastKey = useRef(null);

  useEffect(() => {
    if (!data || !g || !s || !u) return;
    if (lastKey.current === paramsKey) return;
    lastKey.current = paramsKey;
    const unitWords = data.words
      .filter(
        (w) => w.grade === g && w.semester === s && w.unit === u && w.word_en
      )
      .sort((a, b) => a.id - b.id);
    if (unitWords.length) {
      setGrade(g);
      setSemester(s);
      startUnit(unitWords, u, c > 0 ? c : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, paramsKey]);

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
    if (!ok) {
      wrongBook.add(w.id);
      setWrongList((l) => [...l, w]);
    }
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
    return <div className="wrap"><PetEmpty /></div>;
  }

  const totalWords = units.reduce((s, u) => s + u.words.length, 0);
  const curUnit = units.find((u) => u.unit === selUnit) || null;
  const curDone = curUnit ? unitLearned(curUnit.words) : 0;

  return (
    <div className="wrap">
      <ChapterHead
        variant="book"
        ribbon="词跃 · 背书 · 课本同步"
        chLabel={curUnit ? `LECTURE ${curUnit.unit}` : "LECTURE"}
        title={
          curUnit ? (
            <>背完 <span className="ch-hl">Unit {curUnit.unit}</span>，图鉴点亮 +{curUnit.words.length - curDone}</>
          ) : (
            "按单元闯关，图鉴一张张点亮"
          )
        }
        sub={curUnit ? `${curUnit.words.length} 词 · 已学 ${curDone}` : "选 年级 → 册 → 单元"}
        quote={curUnit ? `跟学校进度走，今天 ${curUnit.words.length - curDone} 词。` : "先选单元，再逐词背诵。"}
      />

      <GameBar />

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
                  ③ 选择单元（{semester === 1 ? "上册" : "下册"}）
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
                        <button className="start-btn" onClick={() => startUnit(u.words, u.unit)}>
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
              {cur.word_en.replace(/^\*/, "")}
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
                不认识
              </button>
              <button
                className="reveal-btn inline"
                onClick={() => setRevealed(true)}
                disabled={revealed}
              >
                显示释义
              </button>
              <button className="known-yes" onClick={() => mark(true)}>
                认识
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 完成阶段（统一结算 ResolvePanel，首批：背书共用） ---------- */}
      {phase === "done" && (
        <div className="train-done">
          <ResolvePanel
            kind="self"
            stamp={
              deck.length > 0 && knownCount === deck.length
                ? "本单元通关"
                : `本片完成 ${knownCount}/${deck.length}`
            }
            kpis={[
              { label: "过了一遍", value: deck.length },
              { label: "认识", value: knownCount },
              { label: "不认识", value: deck.length - knownCount },
              { label: "XP", value: `+${knownCount * 2}` },
            ]}
            list={wrongList.map((w) => ({
              word: w.word_en.replace(/^\*/, ""),
              mark: "不认识",
              def: w.definition_zh,
              tag: "错题本",
            }))}
            title="不认识的词（已进错题本）"
            actions={[
              {
                label: "再背一遍",
                primary: true,
                onClick: () => startUnit(deck, selUnit),
              },
              {
                label: "测验本单元 →",
                href: `/exam?grade=${grade}&semester=${semester}&unit=${cur ? cur.unit : 1}`,
              },
              { label: "返回选单元", onClick: () => setPhase("choose") },
            ]}
          />
        </div>
      )}
    </div>
  );
}
