"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, wrongBook, stats, exams } from "@/lib/memory";
import { useQuestionTimer } from "@/lib/timing";
import { game } from "@/lib/game";
import { track } from "@/lib/analytics";
import { ContrastBox } from "../components/AiExplain";
import AiExplainCard from "../components/AiExplain";
import GameBar from "../components/GameBar";
import ResolvePanel from "../components/ResolvePanel";
import ChapterHead from "../components/ChapterHead";
import PetEmpty from "../components/PetEmpty";

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
  const [urlJump, setUrlJump] = useState(null); // 深链 /exam?grade=&semester=&unit=
  const recordedRef = useRef(new Set()); // 已记分的词 id（防重复提交，缺陷防护）

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = Number(q.get("grade"));
    const s = Number(q.get("semester"));
    const u = Number(q.get("unit"));
    if (g && s && u) setUrlJump({ grade: g, semester: s, unit: u });
  }, []);

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
  }, []);

  // 深链直达：数据就绪后定位并直接开考（缺陷 #3）
  useEffect(() => {
    if (!data || !urlJump) return;
    const { grade: g, semester: s, unit: u } = urlJump;
    setGrade(g);
    setSemester(s);
    setUnit(u);
    setPhase("running");
    const pool = data.words.filter(
      (w) => w.grade === g && w.semester === s && w.unit === u && w.word_en
    ).sort((a, b) => a.id - b.id);
    if (pool.length) {
      savedRef.current = false;
      recordedRef.current = new Set();
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
    }
    setUrlJump(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, urlJump]);

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
  const elapsedMs = useQuestionTimer(idx);

  function startExam() {
    if (!unitWords.length) return;
    savedRef.current = false;
    recordedRef.current = new Set();
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
    if (cur && recordedRef.current.has(cur.word.id)) return; // 防重复提交（自动进入下一题的时间窗内再点）
    setPicked(opt);
    setAnswered(true);
    const pickedId = cur.optionIds
      ? cur.optionIds[cur.options.indexOf(opt)] ?? null
      : null;
    finishAnswer(opt === cur.correct, cur.word, pickedId);
  }

  function finishAnswer(ok, w, pickedId) {
    if (recordedRef.current.has(w.id)) return;
    recordedRef.current.add(w.id);
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew, { mode: "exam", elapsed: elapsedMs() });
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
      // ⚠️ deck item 的 id 在 d.word.id（不是 d.id）—— 原来写 d.id 导致错题报告永远为空
      wrong: deck
        .filter((d) => wrongIds.has(d.word.id))
        .map((d) => ({
          ...d,
          id: d.word.id,
          pickedId:
            (results.find((r) => r.id === d.word.id && !r.correct) || {}).pickedId || null,
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
      // 游戏化：按成绩发 XP + 刷新成就
      game.reward("exam", { score: summary.score });
      track("exam_done", { score: summary.score });
      game.refreshAchievements({
        learnedCount: memory.learnedCount(),
        masteredCount: memory.masteredCount(),
        wrongCount: wrongBook.count(),
        streak: stats.streakDays(),
        examBest: summary.score,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, summary]);

  if (!data) {
    return <div className="wrap"><PetEmpty /></div>;
  }

  return (
    <div className="wrap">
      <ChapterHead
        variant="mag"
        chNo={unit ? `U${unit}` : "U-"}
        chLabel={["CHALLENGE", "EXAM", unit ? `UNIT ${unit}` : "选单元"]}
        ribbon={<>词跃 · EXAM <b>单元检验</b></>}
        ribbonRight={`${grade || "-"} 年级`}
        title={<>检验 <span className="ch-hl">{unit ? `Unit ${unit}` : "这一课"}</span>，拿下三星</>}
        sub="≥90 三星 · ≥75 两星 · 成绩记入记忆曲线"
        quote="找个 10 分钟整块时间，勿倍速——检验就是检验。"
      />

      <GameBar />

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

          <div className="setup-label">④ 题量（本单元 {unitWords.length} 词）</div>
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
                剩 {timeLeft} 秒
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
                    ? "超时：" + cur.correct
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
          <ResolvePanel
            kind="judge"
            stamp={`${summary.score} 分`}
            stampTone={summary.score >= 90 ? "fin" : "normal"}
            kpis={[
              { label: "答对", value: summary.correct },
              { label: "答错", value: summary.wrong.length },
              { label: `用时`, value: `${Math.floor(summary.seconds / 60)}'${String(summary.seconds % 60).padStart(2, "0")}"` },
              { label: "评级", value: summary.score >= 90 ? "三星" : summary.score >= 75 ? "两星" : "继续加油" },
            ]}
            list={summary.wrong.map((d) => ({
              word: d.word.word_en.replace(/^\*/, ""),
              mark: "错",
              def: d.word.definition_zh,
              tag: "错题本",
            }))}
            title="错题报告（已进错题本）"
            actions={[
              summary.wrong.length > 0
                ? {
                    label: `重测错题（${summary.wrong.length}）`,
                    primary: true,
                    onClick: () => {
                      savedRef.current = false;
                      setDeck(shuffle(summary.wrong));
                      setIdx(0);
                      setResults([]);
                      setPicked(null);
                      setAnswered(false);
                      setStartAt(Date.now());
                      setPhase("running");
                    },
                  }
                : { label: "再测一次", primary: true, onClick: startExam },
              { label: "再测一次", onClick: startExam },
              { label: "换单元", onClick: () => setPhase("setup") },
            ]}
          />

          {/* 错题的逐条讲解（AI 对比 / 词根），保留原有深度 */}
          {summary.wrong.length > 0 && (
            <div className="bs-explain-extra">
              {summary.wrong.map((d) => (
                <div className="exam-wrong-item" key={d.id}>
                  <div className="exam-wrong-w">
                    <b>{d.word.word_en.replace(/^\*/, "")}</b>
                    {d.word.phonetic && <span>{d.word.phonetic}</span>}
                    <button className="mini-speak" onClick={() => speak(d.word.word_en)}>🔊</button>
                  </div>
                  {d.word.affix_hint && <div className="fb-ex">{d.word.affix_hint}</div>}
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
          )}
        </div>
      )}
    </div>
  );
}
