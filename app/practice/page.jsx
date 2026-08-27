"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { speak } from "@/lib/tts";
import { memory, wrongBook, stats } from "@/lib/memory";

/**
 * AI 个性化练习作答页
 * ?auto=1 默认：服务端按 记忆曲线到期 + 错题本 自动选词（每日缓存）
 * ?grade=&semester=&unit= ：按单元出题
 */
export default function PracticePage() {
  const [questions, setQuestions] = useState([]);
  const [phase, setPhase] = useState("loading"); // loading | error | idle | running | done
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState(null);
  const [input, setInput] = useState("");
  const [results, setResults] = useState([]);
  const [isCached, setIsCached] = useState(false);
  const [source, setSource] = useState("auto");
  const [grade, setGrade] = useState(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const isUnit = !!q.get("unit");
    setSource(isUnit ? "unit" : "auto");
    setGrade(isUnit ? 0 : Number(q.get("grade")) || 0);
    (async () => {
      try {
        const r = await fetch("/api/ai/practice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            count: 10,
            source: isUnit ? "unit" : "auto",
            grade: isUnit ? Number(q.get("grade")) : Number(q.get("grade")) || 0,
            semester: isUnit ? Number(q.get("semester")) : undefined,
            unit: isUnit ? Number(q.get("unit")) : undefined,
          }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "练习加载失败");
        if (d.questions && d.questions.length === 0) throw new Error("没有生成题目");
        setQuestions(d.questions || []);
        setIsCached(!!d.cached);
        setPhase(d.questions && d.questions.length ? "idle" : "error");
      } catch (e) {
        setError(e.message);
        setPhase("error");
      }
    })();
  }, []);

  function switchGrade(g) {
    // 重新按年级生成（每日缓存按 年级+用户 分开，不冲突）
    window.location.href = g ? `/practice?grade=${g}` : "/practice";
  }

  const cur = questions[idx];
  const isFill = cur && cur.type === "fill";
  const isRecall = cur && cur.type === "recall";
  const isTransform = cur && cur.type === "transform";

  function recordAnswer(ok) {
    const q = questions[idx];
    if (!q || !q.wordId) return;
    const prev = memory.get(q.wordId);
    const isNew = !prev || prev.lv === 0;
    memory.record(q.wordId, ok, isNew);
    if (!ok) wrongBook.add(q.wordId);
    stats.add({ n: isNew ? 1 : 0, review: isNew ? 0 : 1, correct: ok ? 1 : 0, total: 1 });
  }

  function check(ok) {
    if (answered) return;
    setAnswered(true);
    recordAnswer(ok);
    setResults((r) => [...r, { wordId: questions[idx].wordId, word: questions[idx].word, correct: ok }]);
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setPhase("done");
    } else {
      setIdx(idx + 1);
      setPicked(null);
      setInput("");
      setAnswered(false);
    }
  }

  function submitGuess() {
    if (answered) return;
    const val = input.trim().toLowerCase();
    check(val === cur.answer);
  }

  const summary = (() => {
    const correct = results.filter((r) => r.correct).length;
    return {
      correct,
      total: results.length,
      pct: results.length ? Math.round((correct / results.length) * 100) : 0,
      wrong: questions.filter((q) => results.some((r) => r.wordId === q.wordId && !r.correct)),
    };
  })();

  function retryWrong() {
    const wrongQs = questions.filter((q) =>
      results.some((r) => r.wordId === q.wordId && !r.correct)
    );
    if (!wrongQs.length) return;
    setQuestions(wrongQs);
    setIdx(0);
    setPicked(null);
    setInput("");
    setAnswered(false);
    setResults([]);
    setPhase("running");
  }

  function restart() {
    setIdx(0);
    setPicked(null);
    setInput("");
    setAnswered(false);
    setResults([]);
    setPhase("running");
  }

  if (phase === "loading") {
    return (
      <div className="wrap">
        <header className="hero">
          <div className="brand">
            <h1>AI 个性化练习</h1>
            <span className="en">Practice</span>
          </div>
          <p className="tagline">
            按你的记忆曲线 + 错题本自动选词 · 答错自动进错题本
          </p>
        </header>
        <div className="empty-state">⏳ AI 练习生成中（约 20~60 秒，今日已生成过则直接加载）…</div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="wrap">
        <header className="hero">
          <div className="brand">
            <h1>AI 个性化练习</h1>
            <span className="en">Practice</span>
          </div>
        </header>
        <div className="empty-state">
          <p>✗ {error}</p>
          {error && error.includes("未配置") && (
            <p style={{ fontSize: 13, marginTop: 8 }}>管理员在服务器设置 LLM_API_KEY 后即可使用。</p>
          )}
          <Link className="start-btn" style={{ display: "inline-block", marginTop: 14 }} href="/">
            返回首页 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>AI 个性化练习</h1>
          <span className="en">
            {source === "unit" ? "Unit Practice" : "Personal Practice"}
          </span>
        </div>
        <p className="tagline">
          {source === "unit"
            ? "按单元出题 · 答案可回写记忆曲线"
            : "按你的记忆曲线 + 错题本自动选词 · 答错自动进错题本"}
          {isCached && <span className="tagline-dot">今日已生成</span>}
        </p>
        {source !== "unit" && (
          <div className="tabs" style={{ marginTop: 10 }}>
            {[
              { v: 0, label: "自动（按我的水平）" },
              { v: 7, label: "七年级" },
              { v: 8, label: "八年级" },
              { v: 9, label: "九年级" },
            ].map((g) => (
              <button
                key={g.v}
                className={"tab" + (grade === g.v ? " active" : "")}
                onClick={() => switchGrade(g.v)}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {phase === "idle" && (
        <div className="empty-state">
          <p>共 {questions.length} 题，开始吧！</p>
          <button className="start-btn" onClick={restart}>
            开始练习 →
          </button>
        </div>
      )}

      {phase === "running" && cur && (
        <div className="prac-card">
          <div className="progress">
            <div className="progress-track">
              <div className="progress-bar" style={{ width: ((idx / questions.length) * 100) + "%" }} />
            </div>
            <span className="progress-text">第 {idx + 1} / {questions.length} 题</span>
          </div>

          {isFill && (
            <>
              <div className="prac-q">{cur.q}</div>
              {cur.q_zh && <div className="prac-zh">{cur.q_zh}</div>}
              <div className="prac-sub">选择正确的单词填入空白处</div>
              <div className="prac-options">
                {cur.options.map((opt, i) => (
                  <button
                    key={i}
                    className={
                      "opt" +
                      (answered
                        ? opt.trim().toLowerCase() === cur.answer
                          ? " right"
                          : picked === opt
                          ? " wrong"
                          : " dim"
                        : "")
                    }
                    onClick={() => {
                      setPicked(opt);
                      check(opt.trim().toLowerCase() === cur.answer);
                    }}
                    disabled={answered}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}

          {(isRecall || isTransform) && (
            <>
              <div className="prac-q">{cur.q}</div>
              <div className="prac-sub">
                {isRecall ? "根据释义与首字母拼出单词" : "写出要求的词形变化"}
                <button className="speak" style={{ marginLeft: 8 }} onClick={() => speak(cur.word)} title="听发音">🔊</button>
              </div>
              <input
                className="prac-input"
                placeholder="输入答案"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !answered && submitGuess()}
                disabled={answered}
                autoFocus
              />
              <div className="dict-actions" style={{ marginTop: 12 }}>
                {!answered ? (
                  <button className="next-btn" onClick={submitGuess}>提交</button>
                ) : null}
              </div>
            </>
          )}

          {answered && (
            <div className="feedback prac-feedback">
              <div className={results[results.length - 1] && results[results.length - 1].correct ? "ok" : "no"}>
                {results[results.length - 1] && results[results.length - 1].correct
                  ? "✓ 回答正确"
                  : "✗ 正确答案：" + cur.answer}
              </div>
              <div className="fb-line">
                {cur.word}
                {cur.definition_zh ? <span className="fb-muted"> · {cur.definition_zh}</span> : null}
              </div>
              <div className="prac-answer">
                <b>解析：</b>
                {cur.explain || "（本词已自动记录到记忆曲线）"}
              </div>
              <button className="next-btn" onClick={next}>
                下一题 →
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <div className="train-done">
          <h2 className="section-h">练习完成 🎉</h2>
          <div className="done-card">
            <div className="done-score">
              {summary.correct}
              <span> / {summary.total}</span>
            </div>
            <div className="done-label">
              正确率 {summary.pct}%
              {summary.wrong.length > 0 && (
                <span className="done-extra"> · {summary.wrong.length} 个错词已进入错题本</span>
              )}
            </div>

            {summary.wrong.length > 0 && (
              <div className="exam-wrong">
                <div className="exam-wrong-title">错题回顾（含解析）</div>
                <div className="exam-wrong-list">
                  {summary.wrong.map((q) => (
                    <div className="exam-wrong-item" key={q.wordId}>
                      <div className="exam-wrong-w">
                        <b>{q.word}</b>
                        {q.definition_zh && <span>{q.definition_zh}</span>}
                      </div>
                      <div className="exam-wrong-d">
                        答案：<b>{q.answer}</b>
                        {q.q_zh ? ` · ${q.q_zh}` : ""}
                        {q.explain ? ` · ${q.explain}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="done-actions">
              {summary.wrong.length > 0 && (
                <button className="start-btn" onClick={retryWrong}>
                  🔁 重练错题
                </button>
              )}
              <button className="start-btn" onClick={restart}>
                再练一遍
              </button>
              <Link className="ghost-btn" href="/review?tab=wrong">
                去错题本 →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}