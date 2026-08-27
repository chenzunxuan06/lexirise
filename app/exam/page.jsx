"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, wrongBook, stats, exams } from "@/lib/memory";
import { ContrastBox } from "../components/AiExplain";
import AiExplainCard from "../components/AiExplain";

const GRADES = [
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

const TIME_OPTS = [
  { value: 10, label: "每题 10 秒" },
  { value: 15, label: "每题 15 秒" },
  { value: 0, label: "不限时" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ExamPage() {
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState(7);
  const [semester, setSemester] = useState(null);
  const [unit, setUnit] = useState(null);
  const [limit, setLimit] = useState(10);
  const [count, setCount] = useState(20); // 0 = 全部

  const [phase, setPhase] = useState("setup"); // setup | running | done
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const savedRef = useRef(false);
  const [picked, setPicked] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [startAt, setStartAt] = useState(0);
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
    return [...s].sort();
  }, [data, grade]);

  const units = useMemo(() => {
    if (!data || !grade || !semester) return [];
    const s = new Set();
    data.words.forEach((w) => {
      if (w.grade === grade && w.semester === semester && w.unit) s.add(w.unit);
    });
    return [...s].sort((a, b) => a - b);
  }, [data, grade, semester]);

  const unitWords = useMemo(() => {
    if (!data || !grade || !semester || !unit) return [];
    return data.words
      .filter((w) => w.grade === grade && w.semester === semester && w.unit === unit && w.word_en)
      .sort((a, b) => a.id - b.id);
  }, [data, grade, semester, unit]);

  const cur = deck[idx];

  function startExam() {
    if (!unitWords.length) return;
    savedRef.current = false;
    const pool = unitWords;
    const n = count === 0 ? pool.length : Math.min(count, pool.length);
    const sample = shuffle(pool).slice(0, n);
    const items = sample.map((w) => {
      const correct = w.definition_zh || w.word_en;
      const others = shuffle(
        pool
          .filter((x) => x.id !== w.id)
          .map((x) => ({ t: x.definition_zh || x.word_en, id: x.id }))
          .filter((d) => d.t && d.t !== correct)
      );
      const opts = shuffle([{ t: correct, id: w.id }, ...others.slice(0, 3)]);
      return {
        word: w,
        options: opts.map((o) => o.t),
        optionIds: opts.map((o) => o.id),
        correct,
      };
    });
    setDeck(items);
    setIdx(0);
    setResults([]);
    setPicked(null);
    setAnswered(false);
    setStartAt(Date.now());
    setPhase("running");
  }

  // 每题计时（进入未作答题目时启动，作答/超时后停止）
  useEffect(() => {
    if (phase !== "running" || !cur || limit === 0 || answered) return;
    setTimeLeft(limit);
    const deadline = Date.now() + limit * 1000;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(iv);
        setPicked(null);
        setAnswered(true);
        finishAnswer(false, cur.word);
      }
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, cur && cur.id, limit, answered]);

  function pick(opt) {
    if (answered) return;
    setPicked(opt);
    setAnswered(true);
    const pickedId = cur.optionIds
      ? cur.optionIds[cur.options.indexOf(opt)] ?? null
      : null;
    finishAnswer(opt === cur.correct, cur.word, pickedId);
  }

  function finishAnswer(ok, w, pickedId) {
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew);
    if (!ok) wrongBook.add(w.id);
    stats.add({ n: isNew ? 1 : 0, review: isNew ? 0 : 1, correct: ok ? 1 : 0, total: 1 });
    setResults((r) => [...r, { id: w.id, correct: ok, pickedId: pickedId ?? null }]);
  }

  // 作答后自动进入下一题
  useEffect(() => {
    if (phase === "running" && answered) {
      const t = setTimeout(() => {
        if (idx + 1 >= deck.length) {
          setPhase("done");
        } else {
          setIdx(idx + 1);
          setPicked(null);
          setAnswered(false);
        }
      }, 1100);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, idx, phase]);

  const summary = useMemo(() => {
    const correct = results.filter((r) => r.correct).length;
    const score = results.length ? Math.round((correct / results.length) * 100) : 0;
    const wrongIds = new Set(results.filter((r) => !r.correct).map((r) => r.id));
    return {
      correct,
      total: results.length,
      score,
      wrong: deck
        .filter((d) => wrongIds.has(d.id))
        .map((d) => ({
          ...d,
          pickedId: (results.find((r) => r.id === d.id && !r.correct) || {}).pickedId || null,
        })),
      seconds: Math.round((Date.now() - startAt) / 1000),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, phase]);

  // 考试结束自动保存成绩到历史（随账号同步）
  useEffect(() => {
    if (phase === "done" && summary.total > 0 && !savedRef.current) {
      savedRef.current = true;
      exams.add({
        grade,
        semester,
        unit,
        label: `${grade}年级${semester === 1 ? "上" : "下"}册 Unit ${unit}`,
        score: summary.score,
        correct: summary.correct,
        total: summary.total,
        seconds: summary.seconds,
        limit,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, summary]);

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>单元测验</h1>
          <span className="en">Unit Exam</span>
        </div>
        <p className="tagline">
          限时选择题 · 整单元检测 · 出分与错题报告（成绩会记入记忆曲线）
        </p>
      </header>

      {phase === "setup" && (
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
                  setUnit(null);
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="setup-label">② 选择学期</div>
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

          <div className="setup-label">③ 选择单元</div>
          <div className="tabs">
            {units.map((u) => (
              <button
                key={u}
                className={"tab" + (unit === u ? " active" : "")}
                onClick={() => setUnit(u)}
              >
                Unit {u}
              </button>
            ))}
          </div>

          <div className="setup-label">④ 题量（本单元共 {unitWords.length} 词）</div>
          <div className="tabs">
            {[
              { value: 10, label: "10 题" },
              { value: 20, label: "20 题" },
              { value: 0, label: "全部" },
            ].map((s) => (
              <button
                key={s.value}
                className={"tab" + (count === s.value ? " active" : "")}
                onClick={() => setCount(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="setup-label">⑤ 每题限时</div>
          <div className="tabs">
            {TIME_OPTS.map((t) => (
              <button
                key={t.value}
                className={"tab" + (limit === t.value ? " active" : "")}
                onClick={() => setLimit(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="setup-foot">
            <span className="pool-count">
              将出 <b>{count === 0 ? unitWords.length : Math.min(count, unitWords.length)}</b> 题
            </span>
            <button className="start-btn" disabled={!unit} onClick={startExam}>
              开始考试 →
            </button>
          </div>
        </div>
      )}

      {phase === "running" && cur && (
        <div className="train-run">
          <div className="exam-head">
            <span className="exam-title">
              单元测验 · Unit {cur.word.unit} · 第 {idx + 1}/{deck.length} 题
            </span>
            {limit > 0 && (
              <span className={"exam-timer" + (timeLeft <= 3 ? " danger" : "")}>
                ⏱ {timeLeft}s
              </span>
            )}
          </div>
          <div className="progress">
            <div className="progress-track">
              <div className="progress-bar" style={{ width: ((idx / deck.length) * 100) + "%" }} />
            </div>
          </div>

          <div className="run-card">
            <div className="run-head">
              <span className="run-word">{cur.word.word_en}</span>
              <button className="speak" onClick={() => speak(cur.word.word_en)} title="朗读">🔊</button>
            </div>
            {cur.word.phonetic && <div className="run-phon">{cur.word.phonetic}</div>}
            <div className="options">
              {cur.options.map((opt, i) => (
                <button
                  key={i}
                  className={
                    "opt" +
                    (answered
                      ? opt === cur.correct
                        ? " right"
                        : picked === opt
                        ? " wrong"
                        : " dim"
                      : "")
                  }
                  onClick={() => pick(opt)}
                  disabled={answered}
                >
                  {opt}
                </button>
              ))}
            </div>
            {answered && (
              <div className="feedback">
                <div className={picked === cur.correct ? "ok" : "no"}>
                  {picked === cur.correct
                    ? "✓ 正确"
                    : timeLeft <= 0
                    ? "⏱ 超时：" + cur.correct
                    : "✗ 正确答案：" + cur.correct}
                </div>
                {cur.word.affix_hint && <div className="fb-ex">🧩 {cur.word.affix_hint}</div>}
                <div className="fb-ex exam-auto">自动进入下一题…</div>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="train-done">
          <h2 className="section-h">考试结束</h2>
          <div className="done-card">
            <div className="exam-score">
              {summary.score}
              <span> 分</span>
            </div>
            <div className="done-label">
              答对 {summary.correct} / {summary.total} · 用时 {Math.floor(summary.seconds / 60)} 分 {summary.seconds % 60} 秒
            </div>

            {summary.wrong.length > 0 && (
              <div className="exam-wrong">
                <div className="exam-wrong-title">错题报告</div>
                <div className="exam-wrong-list">
                  {summary.wrong.map((d) => (
                    <div className="exam-wrong-item" key={d.id}>
                      <div className="exam-wrong-w">
                        <b>{d.word.word_en}</b>
                        {d.word.phonetic && <span>{d.word.phonetic}</span>}
                        <button className="mini-speak" onClick={() => speak(d.word.word_en)}>🔊</button>
                      </div>
                      <div className="exam-wrong-d">{d.word.definition_zh}</div>
                      {d.word.affix_hint && <div className="fb-ex">🧩 {d.word.affix_hint}</div>}
                      <div className="fb-ex">
                        {d.pickedId != null ? (
                          <ContrastBox ids={[d.id, d.pickedId]} />
                        ) : (
                          <AiExplainCard id={d.id} label="讲解" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="done-actions">
              {summary.wrong.length > 0 && (
                <button
                  className="start-btn"
                  onClick={() => {
                    savedRef.current = false;
                    setDeck(shuffle(summary.wrong));
                    setIdx(0);
                    setResults([]);
                    setPicked(null);
                    setAnswered(false);
                    setStartAt(Date.now());
                    setPhase("running");
                  }}
                >
                  🔁 重测错题
                </button>
              )}
              <button className="start-btn" onClick={startExam}>
                再测一次
              </button>
              <button className="ghost-btn" onClick={() => setPhase("setup")}>
                换单元
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
