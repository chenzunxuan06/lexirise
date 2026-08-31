"use client";

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak, speakSlow, speakZh, stopSpeak, unlockAudio } from "@/lib/tts";
import { memory, wrongBook, favs, stats } from "@/lib/memory";
import ExampleBlock from "../components/ExampleBlock";
import { ContrastBox } from "../components/AiExplain";

const GRADES = [
  { value: 0, label: "全部" },
  { value: 7, label: "七年级" },
  { value: 8, label: "八年级" },
  { value: 9, label: "九年级" },
];

const UNIT_LABEL = (g, s, u) => `${g}年级${s === 1 ? "上" : "下"}册 Unit ${u}`;

const MODES = [
  { key: "quiz", label: "选中文", icon: "✅", desc: "看单词，选出正确中文释义" },
  { key: "reverse", label: "选单词", icon: "🔀", desc: "看中文，选出对应单词" },
  { key: "flashcard", label: "闪卡", icon: "🃏", desc: "看词想义，翻面核对" },
  { key: "dictation", label: "听写", icon: "✍️", desc: "看释义听发音，拼出单词" },
  { key: "listening", label: "听力", icon: "🔊", desc: "听发音，选出正确释义" },
];

const SIZES = [
  { value: 10, label: "10 题" },
  { value: 20, label: "20 题" },
  { value: 50, label: "50 题" },
  { value: 0, label: "全部" },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gradeName(g) {
  return g === 7 ? "七年级" : g === 8 ? "八年级" : g === 9 ? "九年级" : "";
}

function ProgressBar({ idx, total }) {
  const pct = total ? Math.round(((idx + 1) / total) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress-track">
        <div className="progress-bar" style={{ width: pct + "%" }} />
      </div>
      <span className="progress-text">
        第 {idx + 1} / {total} 题
      </span>
    </div>
  );
}

/** 词根词缀提示面板 */
function HintPanel({ word, hintLevel, setHintLevel, mode }) {
  if (hintLevel === 0) return null;
  return (
    <div className="hint-panel">
      <div className="hint-row">
        <span className="hint-label">🧩 词根词缀</span>
        <span className="hint-text">
          {word.affix_hint || "暂无词根词缀，试试联系词性/发音记忆"}
        </span>
      </div>
      {mode === "dictation" && (
        <div className="hint-row">
          <span className="hint-label">✏️ 拼写提示</span>
          <span className="hint-text">
            首字母 <b>{word.word_en[0]}</b> · 共 <b>{word.word_en.length}</b> 个字母
          </span>
        </div>
      )}
      {hintLevel >= 2 && (
        <div className="hint-row">
          <span className="hint-label">🎧 音标</span>
          <span className="hint-text">{word.phonetic || "暂无"}</span>
        </div>
      )}
      {hintLevel < 2 && (
        <button className="hint-more" onClick={() => setHintLevel(2)}>
          {mode === "dictation" ? "再看音标" : "再看音标/词性"} →
        </button>
      )}
    </div>
  );
}

function Feedback({ word, ok, pickedCorrect, onNext, onPracticeAgain, wrongChoiceId }) {
  const [fav, setFav] = useState(favs.has(word.id));
  return (
    <div className="feedback">
      <div className={ok ? "ok" : "no"}>
        {ok ? "✓ 回答正确" : "✗ 正确答案：" + (word.definition_zh || word.word_en)}
      </div>
      <div className="fb-line">
        {word.word_en}
        {word.phonetic ? <span className="fb-muted"> · {word.phonetic}</span> : null}
        <button className="mini-speak" onClick={() => speak(word.word_en)}>🔊</button>
        <button
          className={"mini-star" + (fav ? " on" : "")}
          onClick={() => setFav(favs.toggle(word.id))}
          title="收藏到生词本"
        >
          {fav ? "★" : "☆"}
        </button>
      </div>
      {word.affix_hint && <div className="fb-ex">🧩 {word.affix_hint}</div>}
      <ExampleBlock w={word} compact />
      {!ok && wrongChoiceId != null && (
        <div className="fb-ex">
          <ContrastBox ids={[word.id, wrongChoiceId]} />
        </div>
      )}
      {!ok && onPracticeAgain && (
        <button className="ghost-btn" onClick={onPracticeAgain}>
          🔁 加入错题本重练
        </button>
      )}
      <button className="next-btn" onClick={onNext}>
        下一题 →
      </button>
    </div>
  );
}

export default function TrainPage() {
  const [data, setData] = useState(null);

  const [source, setSource] = useState("bank"); // bank | custom
  const [customWords, setCustomWords] = useState([]);
  const [grade, setGrade] = useState(0);
  const [selectedUnits, setSelectedUnits] = useState(new Set());
  const [typeFilter, setTypeFilter] = useState("all"); // all | word | phrase
  const [mode, setMode] = useState("quiz");
  const [size, setSize] = useState(20);

  const [phase, setPhase] = useState("setup"); // setup | running | done
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);

  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState(null);
  const [input, setInput] = useState("");
  const [hintLevel, setHintLevel] = useState(0);

  useEffect(() => {
    // 登录用户拉取"我的词表"（负 id 与主库隔离）
    fetch("/api/words")
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((d) => {
        const cw = (d.words || []).map((w) => ({
          ...w,
          id: -w.id,
          cid: w.id,
          entry_type: "word",
          grade: null,
          semester: null,
          unit: null,
        }));
        setCustomWords(cw);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadWords()
      .then((d) => {
        setData(d);
        // 支持 URL 直达: ?mode=&word= （每日一词） / ?grade=&semester=&unit= （背书页"测验本单元"）
        const q = new URLSearchParams(window.location.search);
        const m = q.get("mode");
        const wid = q.get("word");
        const t = q.get("type");
        const c = q.get("custom");
        const runMode = m && MODES.some((x) => x.key === m) ? m : null;
        if (runMode) setMode(runMode);
        if (t === "word" || t === "phrase") setTypeFilter(t);
        if (c === "1") setSource("custom");

        const g = q.get("grade");
        const sem = q.get("semester");
        const un = q.get("unit");
        const unitPool =
          g && sem && un
            ? d.words.filter(
                (w) =>
                  w.grade === Number(g) &&
                  w.semester === Number(sem) &&
                  w.unit === Number(un) &&
                  w.word_en
              )
            : null;

        const makeOpts = (w, p) => {
          const item = { word: w, id: w.id };
          const mm = runMode || "quiz";
          const buildOpts = (target, getId) => {
            const others = shuffle(
              p
                .filter((x) => x.id !== w.id)
                .map((x) => ({ t: getId(x), id: x.id }))
                .filter((x) => x.t && x.t !== target)
            );
            const opts = shuffle([{ t: target, id: w.id }, ...others.slice(0, 3)]);
            item.options = opts.map((o) => o.t);
            item.optionIds = opts.map((o) => o.id);
            item.correct = target;
          };
          if (mm === "quiz" || mm === "listening") {
            buildOpts(w.definition_zh || w.word_en, (x) => x.definition_zh || x.word_en);
          }
          if (mm === "reverse") {
            buildOpts(w.word_en, (x) => x.word_en);
          }
          return item;
        };

        if (wid) {
          const w = d.words.find((x) => String(x.id) === wid);
          if (w) {
            const item = makeOpts(w, d.words);
            setDeck([item]);
            setIdx(0);
            setPhase("running");
            return;
          }
        }
        if (unitPool && unitPool.length) {
          setGrade(Number(g));
          setSelectedUnits(new Set([`${sem}-${un}`]));
          const items = shuffle(unitPool)
            .slice(0, Math.min(20, unitPool.length))
            .map((w) => makeOpts(w, unitPool));
          startDeck(items);
        }
      })
      .catch((e) => console.error("load words failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 听写/听力模式：进入每题自动朗读
  const cur = deck[idx];
  useEffect(() => {
    if (phase === "running" && cur) {
      if (mode === "listening") {
        const t = setTimeout(() => speak(cur.word.word_en), 350);
        return () => clearTimeout(t);
      }
      if (mode === "dictation") {
        const t = setTimeout(() => speak(cur.word.word_en), 350);
        return () => clearTimeout(t);
      }
    }
  }, [idx, phase, mode, cur]);

  const pool = useMemo(() => {
    if (source === "custom") return customWords;
    if (!data) return [];
    let ws = data.words.filter((w) => w.word_en);
    if (grade) ws = ws.filter((w) => w.grade === grade);
    if (typeFilter === "word") ws = ws.filter((w) => w.entry_type !== "phrase");
    if (typeFilter === "phrase") ws = ws.filter((w) => w.entry_type === "phrase");
    if (selectedUnits.size > 0)
      ws = ws.filter((w) => selectedUnits.has(`${w.semester ?? 0}-${w.unit ?? 0}`));
    return ws;
  }, [data, grade, typeFilter, selectedUnits, source, customWords]);

  const availableUnits = useMemo(() => {
    if (!data) return [];
    const s = new Set();
    data.words.forEach((w) => {
      if (!grade || w.grade === grade) s.add(`${w.semester ?? 0}-${w.unit ?? 0}`);
    });
    return [...s].sort();
  }, [data, grade]);

  function unitLabel(key) {
    const [sm, un] = key.split("-").map(Number);
    if (!un) return "未分组";
    return (sm === 1 ? "上" : sm === 2 ? "下" : "") + `U${un}`;
  }

  function toggleUnit(u) {
    setSelectedUnits((prev) => {
      const n = new Set(prev);
      if (n.has(u)) n.delete(u);
      else n.add(u);
      return n;
    });
  }

  function makeItem(w, poolForOpts) {
    const item = { word: w, id: w.id };
    const buildOpts = (target, getId) => {
      const others = shuffle(
        poolForOpts
          .filter((x) => x.id !== w.id)
          .map((x) => ({ t: getId(x), id: x.id }))
          .filter((x) => x.t && x.t !== target)
      );
      const opts = shuffle([{ t: target, id: w.id }, ...others.slice(0, 3)]);
      item.options = opts.map((o) => o.t);
      item.optionIds = opts.map((o) => o.id);
      item.correct = target;
    };
    if (mode === "quiz" || mode === "listening") {
      buildOpts(w.definition_zh || w.word_en, (x) => x.definition_zh || x.word_en);
    }
    if (mode === "reverse") {
      buildOpts(w.word_en, (x) => x.word_en);
    }
    return item;
  }

  function buildDeck() {
    if (pool.length === 0) return;
    // 用户手势内解锁音频：保证听力/听写模式 350ms 后的自动朗读在移动端不被拦
    unlockAudio();
    const n = size === 0 ? pool.length : Math.min(size, pool.length);
    const sample = shuffle(pool).slice(0, n);
    const items = sample.map((w) => makeItem(w, pool));
    startDeck(items);
  }

  function startDeck(items) {
    setDeck(items);
    setIdx(0);
    setResults([]);
    setFlipped(false);
    setAnswered(false);
    setPicked(null);
    setInput("");
    setHintLevel(0);
    setPhase("running");
  }

  function recordAnswer(ok) {
    const w = deck[idx].word;
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew);
    if (!ok) wrongBook.add(w.id);
    stats.add({
      n: isNew ? 1 : 0,
      review: isNew ? 0 : 1,
      correct: ok ? 1 : 0,
      total: 1,
    });
    setResults((prevR) => [...prevR, { id: w.id, correct: ok }]);
  }

  function next() {
    if (idx + 1 >= deck.length) {
      setPhase("done");
      stopSpeak();
    } else {
      setIdx(idx + 1);
      setFlipped(false);
      setAnswered(false);
      setPicked(null);
      setInput("");
      setHintLevel(0);
    }
  }

  function flashKnown(known) {
    recordAnswer(known);
    next();
  }

  function pickOption(opt) {
    if (answered) return;
    setPicked(opt);
    setAnswered(true);
    recordAnswer(opt === deck[idx].correct);
  }

  // 听写判分用规范化键：与朗读文本对齐（连字符=空格、剥括号/星号、省略号→something），
  // 避免 switch-off / (be) busy with / leave ... behind 类词条“听对了却判错”
  function normKey(s) {
    return String(s)
      .trim()
      .toLowerCase()
      .replace(/\s*[–—-]\s*/g, " ")
      .replace(/\([^)]*\)/g, "")
      .replace(/^\*+/, "")
      .replace(/…+|\.{2,}/g, " something ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function submitDictation() {
    if (answered) return;
    const val = input.trim().toLowerCase();
    const key = normKey(val);
    const target = normKey(deck[idx].word.word_en);
    const ok = key !== "" && key === target;
    setAnswered(true);
    recordAnswer(ok);
  }

  const statsSummary = useMemo(() => {
    const correct = results.filter((r) => r.correct).length;
    const wrong = results.filter((r) => !r.correct);
    return { total: results.length, correct, wrongIds: wrong.map((r) => r.id) };
  }, [results]);

  const wrongPool = useMemo(() => {
    if (!data || !statsSummary.wrongIds.length) return [];
    return data.words.filter((w) => statsSummary.wrongIds.includes(w.id));
  }, [data, statsSummary]);

  function practiceWrong() {
    if (!wrongPool.length) return;
    unlockAudio();
    startDeck(wrongPool.map((w) => makeItem(w, pool.length ? pool : data.words)));
  }

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  return (
    <div className="wrap">
      {phase === "setup" && (
        <div className="train-setup">
          <div className="section-row">
            <h2 className="section-h">训练设置</h2>
            <span className="section-sub">先选范围，再选模式</span>
          </div>

          <div className="setup-card">
            <div className="setup-label">⓪ 选择词源</div>
            <div className="tabs">
              <button
                className={"tab" + (source === "bank" ? " active" : "")}
                onClick={() => setSource("bank")}
              >
                📖 教材词库
              </button>
              <button
                className={"tab" + (source === "custom" ? " active" : "")}
                disabled={customWords.length === 0}
                onClick={() => setSource("custom")}
                title={customWords.length === 0 ? "请先登录并在「我的词表」导入单词" : ""}
              >
                📋 我的词表{customWords.length > 0 ? `（${customWords.length}）` : ""}
              </button>
            </div>

            {source === "bank" && (
              <>
            <div className="setup-label">① 选择年级</div>
            <div className="tabs">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  className={"tab" + (grade === g.value ? " active" : "")}
                  onClick={() => {
                    setGrade(g.value);
                    setSelectedUnits(new Set());
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {availableUnits.length > 0 && (
              <>
                <div className="setup-label">② 选择单元（默认全部）</div>
                <div className="chips">
                  {availableUnits.map((u) => (
                    <button
                      key={u}
                      className={
                        "chip" +
                        (selectedUnits.size === 0 || selectedUnits.has(u) ? " on" : "")
                      }
                      onClick={() => toggleUnit(u)}
                    >
                      {unitLabel(u)}
                    </button>
                  ))}
                  {selectedUnits.size > 0 && (
                    <button className="chip clear" onClick={() => setSelectedUnits(new Set())}>
                      清除
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="setup-label">②½ 词条类型</div>
            <div className="tabs">
              {[
                { k: "all", label: "全部（含短语）" },
                { k: "word", label: "只看单词" },
                { k: "phrase", label: "只看短语" },
              ].map((f) => (
                <button
                  key={f.k}
                  className={"tab" + (typeFilter === f.k ? " active" : "")}
                  onClick={() => setTypeFilter(f.k)}
                >
                  {f.label}
                </button>
              ))}
            </div>
              </>
            )}

            <div className="setup-label">③ 训练模式</div>
            <div className="mode-grid">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  className={"mode-card" + (mode === m.key ? " active" : "")}
                  onClick={() => setMode(m.key)}
                >
                  <div className="mode-icon">{m.icon}</div>
                  <div className="mode-name">{m.label}</div>
                  <div className="mode-desc">{m.desc}</div>
                </button>
              ))}
            </div>

            <div className="setup-label">④ 题量</div>
            <div className="tabs">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  className={"tab" + (size === s.value ? " active" : "")}
                  onClick={() => setSize(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="setup-foot">
              <span className="pool-count">
                当前范围共 <b>{pool.length}</b> 个单词
              </span>
              <button className="start-btn" disabled={pool.length === 0} onClick={buildDeck}>
                开始训练 →
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "running" && cur && (mode === "quiz" || mode === "reverse" || mode === "listening") && (
        <div className="train-run">
          <ProgressBar idx={idx} total={deck.length} />
          <div className="run-card">
            {mode === "quiz" && (
              <div className="run-head">
                <span className="run-word">{cur.word.word_en}</span>
                <button className="speak" onClick={() => speak(cur.word.word_en)} title="朗读">🔊</button>
                <button className="hint-btn" onClick={() => setHintLevel(hintLevel ? 0 : 1)} title="提示">💡 提示</button>
              </div>
            )}
            {mode === "reverse" && (
              <div className="run-head">
                <span className="run-def big">{cur.word.definition_zh}</span>
                <button className="hint-btn" onClick={() => setHintLevel(hintLevel ? 0 : 1)} title="提示">💡 提示</button>
              </div>
            )}
            {mode === "listening" && (
              <div className="listen-head">
                <button className="speak big" onClick={() => speak(cur.word.word_en)} title="再听一次">🔊</button>
                <span className="listen-hint">听发音，选出正确释义</span>
                <button className="hint-btn" onClick={() => setHintLevel(hintLevel ? 0 : 1)} title="提示">💡 提示</button>
              </div>
            )}
            {cur.word.phonetic && mode !== "reverse" && <div className="run-phon">{cur.word.phonetic}</div>}
            <HintPanel word={cur.word} hintLevel={hintLevel} setHintLevel={setHintLevel} mode={mode} />
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
                  onClick={() => pickOption(opt)}
                  disabled={answered}
                >
                  {mode === "reverse" ? (
                    <span className="opt-word">{opt}</span>
                  ) : (
                    opt
                  )}
                </button>
              ))}
            </div>
            {answered && (
              <Feedback
                word={cur.word}
                ok={picked === cur.correct}
                pickedCorrect={picked === cur.correct}
                wrongChoiceId={
                  cur.optionIds && picked != null
                    ? cur.optionIds[cur.options.indexOf(picked)] ?? null
                    : null
                }
                onNext={next}
              />
            )}
          </div>
        </div>
      )}

      {phase === "running" && cur && mode === "flashcard" && (
        <div className="train-run">
          <ProgressBar idx={idx} total={deck.length} />
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
                <div className="hint">点击卡片翻面看释义</div>
                <button
                  className="hint-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHintLevel(hintLevel ? 0 : 1);
                  }}
                >
                  💡 词根词缀
                </button>
                {hintLevel > 0 && cur.word.affix_hint && (
                  <div className="hint-on-card">🧩 {cur.word.affix_hint}</div>
                )}
              </div>
            ) : (
              <div className="flash-back">
                <div className="run-def">{cur.word.definition_zh}</div>
                {cur.word.phonetic && <div className="run-phon">{cur.word.phonetic}</div>}
                {cur.word.affix_hint && <div className="fb-ex">🧩 {cur.word.affix_hint}</div>}
              </div>
            )}
          </div>
          {flipped && (
            <div className="flash-actions">
              <button className="known-no" onClick={() => flashKnown(false)}>
                还没记住
              </button>
              <button className="known-mid" onClick={() => flashKnown(false)}>
                有点模糊
              </button>
              <button className="known-yes" onClick={() => flashKnown(true)}>
                记住了 ✓
              </button>
            </div>
          )}
        </div>
      )}

      {phase === "running" && cur && mode === "dictation" && (
        <div className="train-run">
          <ProgressBar idx={idx} total={deck.length} />
          <div className="run-card">
            <div className="dict-prompt">
              <div className="run-def">{cur.word.definition_zh || cur.word.word_en}</div>
              <div className="dict-btns">
                <button className="speak" onClick={() => speak(cur.word.word_en)} title="听发音">🔊 再读</button>
                <button className="speak" onClick={() => speakSlow(cur.word.word_en)} title="慢速朗读">🐢 慢速</button>
                <button className="hint-btn" onClick={() => setHintLevel(hintLevel ? 0 : 1)}>💡 提示</button>
              </div>
            </div>
            <HintPanel word={cur.word} hintLevel={hintLevel} setHintLevel={setHintLevel} mode="dictation" />
            <input
              className="dict-input"
              placeholder="输入英文拼写"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !answered) submitDictation();
              }}
              disabled={answered}
              autoFocus
            />
            {!answered ? (
              <div className="dict-actions">
                <button className="ghost-btn" onClick={() => setInput("")}>清空</button>
                <button className="next-btn" onClick={submitDictation}>提交</button>
              </div>
            ) : (
              <Feedback
                word={cur.word}
                ok={results[results.length - 1] && results[results.length - 1].correct}
                pickedCorrect={results[results.length - 1] && results[results.length - 1].correct}
                onNext={next}
              />
            )}
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="train-done">
          <h2 className="section-h">训练完成</h2>
          <div className="done-card">
            <div className="done-score">
              {statsSummary.correct}
              <span> / {statsSummary.total}</span>
            </div>
            <div className="done-label">
              正确率 {statsSummary.total ? Math.round((statsSummary.correct / statsSummary.total) * 100) : 0}%
              {wrongPool.length > 0 && (
                <span className="done-extra"> · 有 {wrongPool.length} 个错词进入了错题本</span>
              )}
            </div>
            <div className="done-actions">
              {wrongPool.length > 0 && (
                <button className="start-btn" onClick={practiceWrong}>
                  🔁 重练错词
                </button>
              )}
              <button className="start-btn" onClick={buildDeck}>
                再来一次
              </button>
              <button className="ghost-btn" onClick={() => setPhase("setup")}>
                返回设置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
