"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, wrongBook, favs, stats } from "@/lib/memory";
import { dueDeck } from "@/lib/progress";
import { game } from "@/lib/game";
import { sound } from "@/lib/sound";
import GameBar from "../components/GameBar";
import ChapterHead from "../components/ChapterHead";
import PetImage from "../components/PetImage";
import PetEmpty from "../components/PetEmpty";
import ExampleBlock from "../components/ExampleBlock";
import AiExplainCard from "../components/AiExplain";
import ResolvePanel from "../components/ResolvePanel";

// B4：`DAILY_NEW` 与本地 `shuffle` 已删除 ——
// 复习页不再"顺带学新词"，甲板统一由 lib/progress.js 的 dueDeck() 提供。

export default function ReviewPage() {
  const [data, setData] = useState(null);
  const [custom, setCustom] = useState([]);
  const [tab, setTab] = useState("due"); // due | wrong | favs
  const [statusFilter, setStatusFilter] = useState("all"); // all | new | learning | mastered
  const [showAll, setShowAll] = useState(false); // 到期词「展开全部」
  const [practicing, setPracticing] = useState([]); // 正在练的词
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [finished, setFinished] = useState(false);
  const [forgot, setForgot] = useState([]); // 本轮忘了的词（结算清单）
  const forgotCount = forgot.length;
  const [tick, setTick] = useState(0);
  const [explainId, setExplainId] = useState(null);
  const [combo, setCombo] = useState(0);
  const [comboMsg, setComboMsg] = useState("");
  const [clearMsg, setClearMsg] = useState(false);
  const [coachAct, setCoachAct] = useState("book");
  const flashT = useRef(null);
  function flashAct(a, ms = 1200) {
    setCoachAct(a);
    clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setCoachAct("book"), ms);
  }

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

  // B4 口径统一：到期词不再自己算，改用 lib 的统一口径（含每日上限 + 顺延）。
  // 同时**去掉"顺带学 10 个新词"** —— 新词是可选择的，不归"复习中心"；
  // 以前这里固定塞 10 个新词，与今日甲板的口径对不上，是"不知道先练哪个"的来源之一。
  const rev = useMemo(
    () => (data ? dueDeck(words, { withWrong: false }) : null),
    [words, data]
  );
  const dueWords = useMemo(() => (rev ? rev.words : []), [rev]);

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
    setForgot([]);
    setCombo(0);
    setComboMsg("");
    setClearMsg(false);
  }

  const cur = practicing[idx];

  function answer(ok) {
    if (!cur) return;
    const w = cur.word;
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew);
    if (!ok) wrongBook.add(w.id);
    // 奖励闭环（与训练页一致）：答对结算 / 连对 combo / 错词消灭
    if (ok) {
      game.reward(isNew ? "correct" : "review");
      sound.ok();
      flashAct("cheer", 1200);
      const nxt = combo + 1;
      setCombo(nxt);
      if (nxt === 3 || nxt === 5) {
        sound.combo(nxt);
        setComboMsg(`🔥 连对 x${nxt}！`);
        setTimeout(() => setComboMsg(""), 1500);
      }
      if (nxt === 10) {
        sound.combo(10);
        game.reward("combo10");
        setComboMsg("🔥🔥 连对 x10，额外 +5 XP！");
        setTimeout(() => setComboMsg(""), 1800);
      }
      const r = wrongBook.addOk(w.id);
      if (r === "cleared") {
        game.reward("wrong_cleared");
        flashAct("cheer", 1800);
        setClearMsg(true);
        setTimeout(() => setClearMsg(false), 1600);
      }
    } else {
      setCombo(0);
      sound.bad();
      flashAct("hungry", 1100);
      setForgot((l) => [...l, w]);
    }
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

  // 甲板 = 纯到期词（B4：不再拼新词）
  const reviewDeck = dueWords;

  const filteredReview = useMemo(() => memory.byStatus(reviewDeck, statusFilter), [reviewDeck, statusFilter]);

  // 增7：到期词按单元分组（先截断再分组，与「展开全部」共用同一 slice）
  const groupedDue = useMemo(() => {
    const shown = filteredReview.slice(0, showAll ? filteredReview.length : 24);
    const map = new Map();
    shown.forEach((w) => {
      const k = `${w.grade}-${w.semester}-${w.unit}`;
      if (!map.has(k)) map.set(k, { key: k, grade: w.grade, semester: w.semester, unit: w.unit, words: [] });
      map.get(k).words.push(w);
    });
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
  }, [filteredReview, showAll]);

  if (!data) {
    return <div className="wrap"><PetEmpty /></div>;
  }

  return (
    <div className="wrap">
      <ChapterHead
        variant="mag"
        chNo="01"
        chLabel={["CHAPTER", "REVIEW", "DAILY"]}
        ribbon={<>词跃 · REVIEW <b>每日复习</b></>}
        ribbonRight={`已学 ${memory.learnedCount()} 词`}
        title={<>到期 <span className="ch-hl">{dueWords.length} 词</span>，到时间见它们了</>}
        sub={`错题 ${wrongList.length} · 生词 ${favList.length} · 预计 ${Math.max(4, Math.round((dueWords.length + wrongList.length) * 0.4))} 分钟`}
        quote="记忆曲线把这些词排到今天——别迟到，见了就有熟进度。"
      />

      <GameBar />

      <div className="tabs review-tabs">
        <button
          className={"tab" + (tab === "due" ? " active" : "")}
          onClick={() => setTab("due")}
        >
          到期复习 <b>{dueWords.length}</b>
        </button>
        <button
          className={"tab" + (tab === "wrong" ? " active" : "")}
          onClick={() => setTab("wrong")}
        >
          错题本 <b>{wrongList.length}</b>
        </button>
        <button
          className={"tab" + (tab === "favs" ? " active" : "")}
          onClick={() => setTab("favs")}
        >
          生词本 <b>{favList.length}</b>
        </button>
      </div>

      {/* 练习进行中 */}
      {practicing.length > 0 && cur && (
        <div className="train-run">
          <div className="review-coach">
            <PetImage stage={game.state().stage || 1} action={coachAct} size={40} />
          </div>
          <div className="progress">
            <div className="progress-track">
              <div className="progress-bar" style={{ width: ((done / total) * 100) + "%" }} />
            </div>
            <span className="progress-text">复习 {done} / {total}</span>
          </div>
          {clearMsg && <div className="clear-toast">🎉 消灭错词 +1</div>}
          {comboMsg && <div className="combo-toast">{comboMsg}</div>}
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
              <button className="known-no" onClick={() => answer(false)}>不认识</button>
              <button className="known-yes" onClick={() => answer(true)}>认识</button>
            </div>
          )}
        </div>
      )}

      {finished && (
        <ResolvePanel
          kind="self"
          stamp="本轮完成"
          kpis={[
            { label: "到期复习", value: dueWords.length },
            { label: "记得住", value: done - forgotCount },
            { label: "忘了", value: forgotCount },
            { label: "XP", value: `+${(done - forgotCount) * 2}` },
          ]}
          list={forgot.map((w) => ({
            word: w.word_en.replace(/^\*/, ""),
            mark: "不认识",
            def: w.definition_zh,
            tag: "错题本",
          }))}
          title="忘了的词（已进错题本，连对 2 次消灭）"
          actions={[
            { label: "继续复习", primary: true, onClick: () => setFinished(false) },
            { label: "返回列表", onClick: () => setFinished(false) },
          ]}
        />
      )}

      {/* 到期复习 */}
      {practicing.length === 0 && tab === "due" && (
        <div className="review-block">
          <div className="review-head">
            <h2 className="section-h">
              到期复习
              {rev && rev.deferred > 0 ? `（今天 ${rev.due} 词 · 另有 ${rev.deferred} 个顺延到明天）` : ""}
            </h2>
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
              {statusFilter === "all" ? "暂时没有到期的单词。" : "该状态下没有单词。"}
              去 <a className="link" href="/train">训练中心</a> 学点新词吧！
            </div>
          ) : (
            <div className="review-grid">
              {groupedDue.map((g) => (
                <div className="rg-group" key={g.key}>
                  <div className="rg-group-h">
                    {g.grade} 年级{g.semester === 1 ? "上" : "下"}册 · Unit {g.unit}
                    <span>{g.words.length} 词</span>
                  </div>
                  <div className="rg-group-list">
                    {g.words.map((w) => (
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
                  </div>
                </div>
              ))}
              {filteredReview.length > 24 && (
                <button
                  className="review-more"
                  onClick={() => setShowAll((s) => !s)}
                >
                  {showAll
                    ? `收起（前 24 词）`
                    : `展开全部（还有 ${filteredReview.length - 24} 词）`}
                </button>
              )}
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
                  <div className="wrong-ai-row">
                    <button
                      className="mini-ai-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExplainId(explainId === word.id ? null : word.id);
                      }}
                    >
                      ✨ AI 讲解
                    </button>
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
                  {explainId === word.id && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <AiExplainCard id={word.id} />
                    </div>
                  )}
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
