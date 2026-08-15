"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, wrongBook, favs, stats } from "@/lib/memory";
import ExampleBlock from "../components/ExampleBlock";

const DAILY_NEW = 10; // 每次复习顺带学习的新词数

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ReviewPage() {
  const [data, setData] = useState(null);
  const [custom, setCustom] = useState([]);
  const [tab, setTab] = useState("due"); // due | wrong | favs
  const [statusFilter, setStatusFilter] = useState("all"); // all | new | learning | mastered
  const [practicing, setPracticing] = useState([]); // 正在练的词
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [finished, setFinished] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
    // 登录用户合并"我的词表"（负 id 与主库隔离）
    fetch("/api/words")
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((d) => {
        setCustom(
          (d.words || []).map((w) => ({
            ...w,
            id: -w.id,
            entry_type: "word",
            grade: null,
            semester: null,
            unit: null,
          }))
        );
      })
      .catch(() => {});
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q === "wrong" || q === "favs") setTab(q);
  }, []);

  const words = useMemo(
    () => (data ? [...data.words, ...custom] : custom),
    [data, custom]
  );

  const dueWords = useMemo(() => memory.dueWords(words), [words, tick]);
  const newWords = useMemo(() => {
    const m = memory.load();
    return shuffle(words.filter((w) => !m[w.id] || m[w.id].lv === 0)).slice(0, DAILY_NEW);
  }, [words, tick]);

  const wrongList = useMemo(() => {
    const e = wrongBook.entries();
    const map = new Map(words.map((w) => [w.id, w]));
    return e
      .map(([id, info]) => ({ word: map.get(Number(id)), n: info.n }))
      .filter((x) => x.word)
      .sort((a, b) => b.n - a.n);
  }, [words, tick]);

  const favList = useMemo(() => {
    const e = favs.entries();
    const map = new Map(words.map((w) => [w.id, w]));
    return e
      .map(([id]) => map.get(Number(id)))
      .filter(Boolean);
  }, [words, tick]);

  function startPractice(list) {
    if (!list.length) return;
    setPracticing(list.map((w) => ({ word: w })));
    setIdx(0);
    setFlipped(false);
    setDone(0);
    setTotal(list.length);
    setFinished(false);
  }

  const cur = practicing[idx];

  function answer(ok) {
    if (!cur) return;
    const w = cur.word;
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew);
    if (!ok) wrongBook.add(w.id);
    stats.add({ n: isNew ? 1 : 0, review: isNew ? 0 : 1, correct: ok ? 1 : 0, total: 1 });
    setDone((d) => d + 1);
    setTick((t) => t + 1);
    if (idx + 1 >= practicing.length) {
      setPracticing([]);
      setFinished(true);
    } else {
      setIdx(idx + 1);
      setFlipped(false);
    }
  }

  const reviewDeck = useMemo(() => {
    if (!dueWords.length) return [];
    const rest = newWords.filter((w) => !dueWords.some((d) => d.id === w.id));
    return [...dueWords, ...rest];
  }, [dueWords, newWords]);

  const filteredReview = useMemo(() => memory.byStatus(reviewDeck, statusFilter), [reviewDeck, statusFilter]);

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>复习中心</h1>
          <span className="en">Review</span>
        </div>
        <p className="tagline">
          记忆曲线自动安排复习 · 错题自动收录 · 生词一键收藏
          {memory.learnedCount() > 0 && (
            <span className="tagline-dot">已学 {memory.learnedCount()} 词 · 掌握 {memory.masteredCount()} 词</span>
          )}
        </p>
      </header>

      <div className="tabs review-tabs">
        <button
          className={"tab" + (tab === "due" ? " active" : "")}
          onClick={() => setTab("due")}
        >
          🔁 到期复习 <b>{dueWords.length}</b>
        </button>
        <button
          className={"tab" + (tab === "wrong" ? " active" : "")}
          onClick={() => setTab("wrong")}
        >
          ❌ 错题本 <b>{wrongList.length}</b>
        </button>
        <button
          className={"tab" + (tab === "favs" ? " active" : "")}
          onClick={() => setTab("favs")}
        >
          ⭐ 生词本 <b>{favList.length}</b>
        </button>
      </div>

      {/* 练习进行中 */}
      {practicing.length > 0 && cur && (
        <div className="train-run">
          <div className="progress">
            <div className="progress-track">
              <div className="progress-bar" style={{ width: ((done / total) * 100) + "%" }} />
            </div>
            <span className="progress-text">复习 {done} / {total}</span>
          </div>
          <div
            className={"flash-card" + (flipped ? " flipped" : "")}
            onClick={() => !flipped && setFlipped(true)}
          >
            {!flipped ? (
              <div className="flash-front">
                <div className="run-word">{cur.word.word_en}</div>
                {cur.word.phonetic && <div className="run-phon">{cur.word.phonetic}</div>}
                <button
                  className="speak big"
                  onClick={(e) => {
                    e.stopPropagation();
                    speak(cur.word.word_en);
                  }}
                >
                  🔊
                </button>
                <div className="hint">点击卡片翻面核对</div>
              </div>
            ) : (
              <div className="flash-back">
                <div className="run-def">{cur.word.definition_zh}</div>
                {cur.word.phonetic && <div className="run-phon">{cur.word.phonetic}</div>}
                {cur.word.affix_hint && <div className="fb-ex">🧩 {cur.word.affix_hint}</div>}
                <ExampleBlock w={cur.word} compact />
              </div>
            )}
          </div>
          {flipped && (
            <div className="flash-actions">
              <button className="known-no" onClick={() => answer(false)}>忘了</button>
              <button className="known-mid" onClick={() => answer(false)}>模糊</button>
              <button className="known-yes" onClick={() => answer(true)}>记住了 ✓</button>
            </div>
          )}
        </div>
      )}

      {finished && (
        <div className="done-card review-done">
          <div className="done-score">完成！</div>
          <div className="done-label">本轮复习 {done} 个单词，已自动更新记忆曲线</div>
          <div className="done-actions">
            <button className="start-btn" onClick={() => setFinished(false)}>返回列表</button>
          </div>
        </div>
      )}

      {/* 到期复习 */}
      {practicing.length === 0 && tab === "due" && (
        <div className="review-block">
          <div className="review-head">
            <h2 className="section-h">到期复习（+ 新词 {newWords.length}）</h2>
            <div className="review-actions">
              <div className="tabs mini-tabs">
                {[
                  { k: "all", label: "全部" },
                  { k: "new", label: "新词" },
                  { k: "learning", label: "学习中" },
                  { k: "mastered", label: "已掌握" },
                ].map((f) => (
                  <button
                    key={f.k}
                    className={"tab" + (statusFilter === f.k ? " active" : "")}
                    onClick={() => setStatusFilter(f.k)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                className="start-btn"
                disabled={filteredReview.length === 0}
                onClick={() => startPractice(filteredReview)}
              >
                开始复习 →
              </button>
            </div>
          </div>
          {filteredReview.length === 0 ? (
            <div className="empty-state">
              🎉 {statusFilter === "all" ? "暂时没有到期的单词。" : "该状态下没有单词。"}
              去 <a className="link" href="/train">训练中心</a> 学点新词吧！
            </div>
          ) : (
            <div className="review-grid">
              {filteredReview.slice(0, 24).map((w) => (
                <div className="review-chip" key={w.id}>
                  <b>{w.word_en}</b>
                  <span>{w.definition_zh}</span>
                  {memory.get(w.id) && memory.get(w.id).lv > 0 ? (
                    <em>复习</em>
                  ) : (
                    <em className="new">新词</em>
                  )}
                </div>
              ))}
              {filteredReview.length > 24 && <div className="review-more">…共 {filteredReview.length} 词</div>}
            </div>
          )}
        </div>
      )}

      {/* 错题本 */}
      {practicing.length === 0 && tab === "wrong" && (
        <div className="review-block">
          <div className="review-head">
            <h2 className="section-h">错题本</h2>
            <div className="review-actions">
              {wrongList.length > 0 && (
                <>
                  <button
                    className="ghost-btn"
                    onClick={() => {
                      wrongBook.clear();
                      setTick((t) => t + 1);
                    }}
                  >
                    清空
                  </button>
                  <button className="start-btn" onClick={() => startPractice(wrongList.map((x) => x.word), "wrong")}>
                    重练错词 →
                  </button>
                </>
              )}
            </div>
          </div>
          {wrongList.length === 0 ? (
            <div className="empty-state">✅ 错题本空空如也，继续保持！</div>
          ) : (
            <div className="cards">
              {wrongList.map(({ word, n }) => (
                <div className="word-card" key={word.id} onClick={() => setFlipped(false)}>
                  <div className="w">
                    {word.word_en}
                    <span className="badge err">{n} 次错</span>
                  </div>
                  <div className="def">{word.definition_zh}</div>
                  <button
                    className="mini-x"
                    onClick={(e) => {
                      e.stopPropagation();
                      wrongBook.remove(word.id);
                      setTick((t) => t + 1);
                    }}
                  >
                    移出 ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 生词本 */}
      {practicing.length === 0 && tab === "favs" && (
        <div className="review-block">
          <div className="review-head">
            <h2 className="section-h">生词本</h2>
            <div className="review-actions">
              {favList.length > 0 && (
                <button className="start-btn" onClick={() => startPractice(favList, "favs")}>
                  翻看生词 →
                </button>
              )}
            </div>
          </div>
          {favList.length === 0 ? (
            <div className="empty-state">
              还没有收藏。在词库详情或训练反馈里点 <b>☆</b> 即可收藏生词。
            </div>
          ) : (
            <div className="cards">
              {favList.map((w) => (
                <div className="word-card" key={w.id}>
                  <div className="w">{w.word_en}</div>
                  {w.phonetic && <div className="ph">{w.phonetic}</div>}
                  <div className="def">{w.definition_zh}</div>
                  {w.affix_hint && <div className="affix-dot-line">🧩 {w.affix_hint}</div>}
                  <button
                    className="mini-x"
                    onClick={() => {
                      favs.remove(w.id);
                      setTick((t) => t + 1);
                    }}
                  >
                    取消收藏 ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
