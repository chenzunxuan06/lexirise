"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { speak, speakSlow, speakZh, stopSpeak, unlockAudio } from "@/lib/tts";
import { memory, wrongBook, favs, stats, plan, exams } from "@/lib/memory";
import { game } from "@/lib/game";
import { composeDailyDeck, todaySummary, readReviewCap, saveReviewCap, REVIEW_CAP_CHOICES, DEFAULT_REVIEW_CAP } from "@/lib/progress";
import { sync } from "@/lib/sync";
import { sound } from "@/lib/sound";
import { track } from "@/lib/analytics";
import ExampleBlock from "../components/ExampleBlock";
import { ContrastBox } from "../components/AiExplain";
import GameBar from "../components/GameBar";
import ResolvePanel from "../components/ResolvePanel";
import ChapterHead from "../components/ChapterHead";
import PetImage from "../components/PetImage";
import PetEmpty from "../components/PetEmpty";

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

/**
 * 今日模式自动组题：到期复习词 + 错词（占比≥1/3）+ 新词补足每日目标
 * 口径已统一到 lib/progress.js（方向C 阶段-1b），首页"今天该背 N 词"与实际出题数一致
 */

/** 今日模式固定用"选中文"题型组选项 */
function makeQuizItem(w, poolForOpts) {
  const item = { word: w, id: w.id };
  const target = w.definition_zh || w.word_en;
  const others = shuffle(
    poolForOpts
      .filter((x) => x.id !== w.id)
      .map((x) => ({ t: x.definition_zh || x.word_en, id: x.id }))
      .filter((x) => x.t && x.t !== target)
  );
  const opts = shuffle([{ t: target, id: w.id }, ...others.slice(0, 3)]);
  item.options = opts.map((o) => o.t);
  item.optionIds = opts.map((o) => o.id);
  item.correct = target;
  return item;
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

  const [grade, setGrade] = useState(0);
  const [selSem, setSelSem] = useState("1"); // 学期筛选：all | 1 | 2（默认上册，符合学校进度）
  const [selUnit, setSelUnit] = useState("all"); // 单元筛选：all | 单元号 | "x-y"（学期为全部时的 册-单元）
  const [typeFilter, setTypeFilter] = useState("all"); // all | word | phrase
  const [source, setSource] = useState("book"); // book 教材词库 | custom 我的词表（缺陷 #4 修复）
  const [customWords, setCustomWords] = useState([]);
  const [autoStartCustom, setAutoStartCustom] = useState(false);
  const [mode, setMode] = useState("quiz");
  const [size, setSize] = useState(20);

  const [phase, setPhase] = useState("setup"); // setup | running | done
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [daily, setDaily] = useState(false); // 今日模式（自动组题：复习+错词+新词）
  // 「开始前」简报屏（2026-09-30 B2）：不再一点就出题。
  //   brief        = 是否正在显示简报屏
  //   pickBlocks   = 三块的勾选状态（到期/错题默认勾，新词默认不勾，见下方 effect）
  //   reviewCap    = 每日复习上限（0 = 不封顶）；初值用常量保证 SSR 与水合一致，真实值在 effect 里读
  //   fromBrief    = 本轮是否从简报屏开始的（决定「退出本轮」回哪里）
  const [brief, setBrief] = useState(false);
  const [pickBlocks, setPickBlocks] = useState({ due: true, wrong: true, new: false });
  const [reviewCap, setReviewCap] = useState(DEFAULT_REVIEW_CAP);
  const [fromBrief, setFromBrief] = useState(false);
  const [clearedCount, setClearedCount] = useState(0); // 本轮消灭的错词数
  const [clearToast, setClearToast] = useState(false); // 消灭瞬间的提示
  const [coachAct, setCoachAct] = useState("book"); // 陪练位动作帧
  const flashT = useRef(null);
  function flashAct(a, ms = 1200) {
    setCoachAct(a);
    clearTimeout(flashT.current);
    flashT.current = setTimeout(() => setCoachAct("book"), ms);
  }
  const [combo, setCombo] = useState(0); // 连对计数
  const [comboMsg, setComboMsg] = useState(""); // 连对提示文案

  const [flipped, setFlipped] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState(null);
  const [input, setInput] = useState("");
  const [hintLevel, setHintLevel] = useState(0);

  useEffect(() => {
    // 我的词表（缺陷 #4 修复）：加载自定义词，负 id 与教材词库隔离（防记忆曲线串数据）
    const q0 = new URLSearchParams(window.location.search);
    if (q0.get("custom") === "1") setSource("custom");
    fetch("/api/words")
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((d) =>
        setCustomWords(
          (d.words || []).map((w) => ({
            ...w,
            id: -w.id,
            entry_type: "word",
            grade: null,
            semester: null,
            unit: null,
          }))
        )
      )
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
        const runMode = m && MODES.some((x) => x.key === m) ? m : null;
        if (runMode) setMode(runMode);
        if (t === "word" || t === "phrase") setTypeFilter(t);

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

        if (m === "daily") {
          // 今日模式（2026-09-30 B2 修复）：**不再直达第一题**。
          // 以前这里直接 composeDailyDeck + startDeck，用户点任何"开始"就被塞 76 题、还退不出去。
          // 现在只打开「开始前」简报屏，让 ta 看清今天做什么、可以取消不想做的块，再自己按开始。
          setBrief(true);
          return;
        }
        if (q.get("custom") === "1" && runMode) {
          // 我的词表直达（缺陷 #4）：词源切到 custom，等词加载后自动开题
          setSource("custom");
          setAutoStartCustom(true);
          return;
        }
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
          setSelSem(String(sem));
          setSelUnit(String(un));
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

  // 训练完成时惰性评估成就徽章
  useEffect(() => {
    if (phase !== "done" || !data) return;
    track("train_done", { daily, total: results.length });
    const exs = exams.list();
    const examBest = exs.length ? Math.max(...exs.map((e) => e.score || 0)) : 0;
    game.refreshAchievements({
      learnedCount: memory.learnedCount(),
      masteredCount: memory.masteredCount(),
      wrongCount: wrongBook.count(),
      streak: stats.streakDays(),
      examBest,
      totalWords: data.words.length,
    });
  }, [phase, data]);

  const pool = useMemo(() => {
    if (source === "custom") {
      // 我的词表：不按年级/单元过滤
      const ws = customWords.filter((w) => w.word_en);
      if (typeFilter === "word") return ws.filter((w) => w.entry_type !== "phrase");
      if (typeFilter === "phrase") return ws.filter((w) => w.entry_type === "phrase");
      return ws;
    }
    if (!data) return [];
    let ws = data.words.filter((w) => w.word_en);
    if (grade) ws = ws.filter((w) => w.grade === grade);
    if (typeFilter === "word") ws = ws.filter((w) => w.entry_type !== "phrase");
    if (typeFilter === "phrase") ws = ws.filter((w) => w.entry_type === "phrase");
    if (selSem !== "all") ws = ws.filter((w) => String(w.semester) === selSem);
    if (selUnit !== "all") {
      if (selUnit.includes("-")) {
        const [sm, un] = selUnit.split("-");
        ws = ws.filter((w) => String(w.semester) === sm && String(w.unit) === un);
      } else {
        ws = ws.filter((w) => String(w.unit) === selUnit);
      }
    }
    return ws;
  }, [data, grade, typeFilter, selSem, selUnit, source, customWords]);

  // 缺陷 #4：custom=1 直达 → 我的词表就绪后自动开题
  useEffect(() => {
    if (!autoStartCustom || source !== "custom" || phase !== "setup") return;
    if (!customWords.length) return; // 等加载（未登录则永远空 → 停在设置页显示提示）
    setAutoStartCustom(false);
    buildDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartCustom, source, phase, customWords.length]);

  // 单元下拉：学期已选 → 该册 Unit；学期=全部 → 带"上册/下册"前缀区分
  const availableUnits = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    data.words.forEach((w) => {
      const okGrade = !grade || w.grade === grade;
      if (!okGrade || !w.unit || !w.semester) return;
      if (selSem !== "all" && String(w.semester) !== selSem) return;
      const key = selSem === "all" ? `${w.semester}-${w.unit}` : String(w.unit);
      if (!map.has(key)) {
        map.set(key, {
          v: key,
          t:
            selSem === "all"
              ? `${w.semester === 1 ? "上册" : "下册"} Unit ${w.unit}`
              : `Unit ${w.unit}`,
        });
      }
    });
    return [...map.values()].sort((a, b) => a.v.localeCompare(b.v, "en", { numeric: true }));
  }, [data, grade, selSem]);

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
    setFromBrief(false); // 自定义训练 → 「退出本轮」回自定义设置，不回简报屏
    startDeck(items);
  }

  function startDeck(items) {
    setDeck(items);
    setIdx(0);
    setResults([]);
    setClearedCount(0);
    setCombo(0);
    setComboMsg("");
    setFlipped(false);
    setAnswered(false);
    setPicked(null);
    setInput("");
    setHintLevel(0);
    advancedRef.current = false; // 重置前进守卫
    setPhase("running");
  }

  /** 按「开始前」的选择开一轮（简报屏的「开始」与结算页的「再练一轮」共用）。
   *  组题参数与简报屏预览**完全一致**（dueLimit + include），所以显示多少就出多少。 */
  function startDaily() {
    if (!data) return;
    const cap = readReviewCap();
    const { deck: deckWords } = composeDailyDeck(data.words, {
      dueLimit: cap,
      include: { ...pickBlocks },
    });
    if (!deckWords.length) return; // 按钮在此之前已按 pickedCount===0 禁用，这里只是兜底
    unlockAudio(); // 必须留在用户手势里：听力/听写模式 350ms 后要自动朗读
    setDaily(true);
    setFromBrief(true);
    setMode("quiz");
    startDeck(deckWords.map((w) => makeQuizItem(w, data.words)));
  }

  /** 退出本轮：已答的题**已经写进记忆曲线**（recordAnswer → memory.record），
   *  这里只清本轮甲板，不撤销任何记录 —— 所以"退出去"不会白答。 */
  function exitRound() {
    setDeck([]);
    setIdx(0);
    setResults([]);
    setPhase("setup");
    setBrief(fromBrief); // 从简报屏来的 → 回简报屏；从自定义训练来的 → 回自定义设置
  }

  function recordAnswer(ok) {
    const w = deck[idx].word;
    const prev = memory.get(w.id);
    const isNew = !prev || prev.lv === 0;
    memory.record(w.id, ok, isNew);
    if (!ok) {
      wrongBook.add(w.id);
      setCombo(0);
      sound.bad();
      flashAct("hungry", 1100);
    } else {
      // 连对 combo + XP
      const nxt = combo + 1;
      setCombo(nxt);
      game.reward(isNew ? "correct" : "review");
      sound.ok();
      flashAct("cheer", 1200);
      if (nxt === 3 || nxt === 5) {
        sound.combo(nxt); // 连击进度由题卡徽章呈现
      }
      if (nxt === 10) {
        sound.combo(10);
        game.reward("combo10");
        setComboMsg("🔥🔥 连对 x10，额外 +5 XP！");
        setTimeout(() => setComboMsg(""), 1800);
      }
      // 错词消灭机制：连对 2 次自动移出错题本
      const r = wrongBook.addOk(w.id);
      if (r === "cleared") {
        game.reward("wrong_cleared");
        flashAct("cheer", 1800);
        setClearedCount((c) => c + 1);
        setClearToast(true);
        setTimeout(() => setClearToast(false), 1600);
      }
    }
    stats.add({
      n: isNew ? 1 : 0,
      review: isNew ? 0 : 1,
      correct: ok ? 1 : 0,
      total: 1,
    });
    setResults((prevR) => [...prevR, { id: w.id, correct: ok }]);
  }

  // 多邻国式节奏：每道题只允许前进一次（手动/自动二选一，防重复跳题）
  const advancedRef = useRef(false);

  // 切到新一题时解锁守卫（第一题答完推进后保持锁定，直到新题渲染）
  useEffect(() => {
    advancedRef.current = false;
  }, [idx]);

  // 答对自动进下一题（0.75s）；答错停留手动。置于答题状态之上，绕开事件闭包时序。
  const [lastOk, setLastOk] = useState(false);
  useEffect(() => {
    if (lastOk && answered && idx < deck.length) {
      const t = setTimeout(() => next(), 750);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastOk, answered, idx]);

  function next() {
    if (advancedRef.current) return;
    advancedRef.current = true;
    setLastOk(false);
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
    const ok = opt === deck[idx].correct;
    setLastOk(ok);
    recordAnswer(ok);
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
    setLastOk(ok);
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

  // ── 以下三个 hook 必须在下面的 early return **之前**（Rules of Hooks）──
  // 「开始前」预览：与实际开题**同一个函数、同一组参数** → 显示多少就出多少。
  // （这就是 2026-09-30 那个「标题 76 / 分母 77」的根：标题原本每次渲染重算，分母是开局快照。）
  const preview = useMemo(() => {
    if (!data || !brief) return null;
    return composeDailyDeck(data.words, {
      dueLimit: reviewCap,
      include: { due: true, wrong: true, new: true }, // 要的是"每块各自有多少条"
    });
  }, [data, brief, reviewCap]);

  // 到期为 0 时自动勾上「新词」——否则新用户打开会看到"已选 0 题"，以为坏了
  const dueAllN = preview ? preview.dueAll : -1;
  useEffect(() => {
    if (dueAllN === 0) setPickBlocks((p) => (p.new ? p : { ...p, new: true }));
  }, [dueAllN]);

  // 读回记住的每日上限（放 effect 里读 localStorage，避免 SSR/水合不一致）
  useEffect(() => {
    setReviewCap(readReviewCap());
  }, []);

  if (!data) {
    return <div className="wrap"><PetEmpty /></div>;
  }

  // 章首动态数据（今日待办，统一口径 lib/progress.js）
  const summary = todaySummary(data.words);
  const todoCount = summary.todo;
  const dueCount = summary.due;
  const wrongCount = summary.wrong;
  const newLeft = summary.fresh;

  // 简报屏的汇总 = 已勾选那几块的条数之和（三块互斥，所以直接相加 == 实际开题数）
  const pickedCount = preview
    ? (pickBlocks.due ? preview.due : 0) + (pickBlocks.wrong ? preview.wrong : 0) + (pickBlocks.new ? preview.fresh : 0)
    : 0;
  const pickedMinutes = Math.max(1, Math.round(pickedCount * 0.35));

  // 同源：进行中一律用开局锁定的 deck.length —— 与 <ProgressBar total={deck.length}> 同一个来源，
  // 保证"标题数字 == 进度条分母"，不会再出现 76 / 77 这种对不上账
  const headerCount = phase === "setup" ? (brief ? pickedCount : todoCount) : deck.length;

  return (
    <div className="wrap">
      <ChapterHead
        variant="mag"
        chNo="01"
        chLabel={["ROUND", "TRAIN", "DAILY"]}
        ribbon={<>词跃 · TRAIN <b>今日修炼</b></>}
        ribbonRight="每日一轮"
        title={<>今天 <span className="ch-hl">{headerCount} 题</span>，主打消灭错词</>}
        sub={brief && preview
          ? `已选 ${pickedCount} 题 · 约 ${pickedMinutes} 分钟（可以取消不想做的）`
          : `到期 ${dueCount} · 错词 ${wrongCount} · 新词 ${newLeft}`}
        quote="答对修炼、消灭盖章——一轮结束有结算章。"
      />
      <GameBar />
      {clearToast && <div className="clear-toast">🎉 消灭错词 +1</div>}
      {comboMsg && <div className="combo-toast">{comboMsg}</div>}
      {phase === "setup" && brief && preview && (
        <div className="train-setup">
          <div className="daily-brief">
            <div className="db-h">今天要做的事</div>
            <div className="db-sub">勾掉不想做的，题目数会跟着变。来源：记忆曲线 + 错题本 + 每日目标。</div>

            <div className="db-blks">
              <button
                className={"db-blk" + (pickBlocks.due ? " on" : "")}
                onClick={() => setPickBlocks((p) => ({ ...p, due: !p.due }))}
              >
                <span className="db-ck" aria-hidden="true" />
                <span className="db-b">
                  <span className="db-t">到期复习</span>
                  <span className="db-d">
                    {preview.dueAll === 0 ? (
                      "今天没有到期的词"
                    ) : (
                      <>
                        今天 <b>{preview.due}</b> 词
                        {preview.deferred > 0 ? <> · 另有 <b>{preview.deferred}</b> 个顺延到明天</> : null}
                      </>
                    )}
                  </span>
                </span>
              </button>

              <button
                className={"db-blk" + (pickBlocks.wrong ? " on" : "")}
                onClick={() => setPickBlocks((p) => ({ ...p, wrong: !p.wrong }))}
              >
                <span className="db-ck" aria-hidden="true" />
                <span className="db-b">
                  <span className="db-t">错题重做</span>
                  <span className="db-d">
                    {preview.wrong > 0 ? <><b>{preview.wrong}</b> 词 · 连对 2 次移出错题本</> : "错题本是空的"}
                  </span>
                </span>
              </button>

              <button
                className={"db-blk" + (pickBlocks.new ? " on" : "")}
                onClick={() => setPickBlocks((p) => ({ ...p, new: !p.new }))}
              >
                <span className="db-ck" aria-hidden="true" />
                <span className="db-b">
                  <span className="db-t">今日新词</span>
                  <span className="db-d">
                    {preview.fresh > 0 ? <>来自教材 · <b>{preview.fresh}</b> 词</> : "今天的新词已经学完"}
                  </span>
                </span>
              </button>
            </div>

            {preview.dueAll > 0 && (
              <div className="db-caprow">
                <span className="db-caplb">今天复习做多少：</span>
                <span className="db-caps">
                  {REVIEW_CAP_CHOICES.map((n) => (
                    <button
                      key={n}
                      className={"db-cap" + (reviewCap === n ? " on" : "")}
                      onClick={() => {
                        setReviewCap(n);
                        saveReviewCap(n); // 立即落库：下次进来还是这个值
                      }}
                    >
                      {n === 0 ? "全部" : n}
                    </button>
                  ))}
                </span>
                <span className="db-capnote">选过的会记住</span>
              </div>
            )}

            <div className="db-sum">
              <span className="db-suml">
                已选 <b>{pickedCount}</b> 题 · 约 <b>{pickedMinutes}</b> 分钟
              </span>
              <span className="db-btns">
                <a className="db-ghost" href="/">稍后再说</a>
                <button className="db-go" disabled={pickedCount === 0} onClick={startDaily}>
                  开始 →
                </button>
              </span>
            </div>
            {pickedCount === 0 && <div className="db-empty">三块都没勾，先选一块再开始。</div>}
          </div>

          <div className="db-back">
            <button className="link" onClick={() => setBrief(false)}>
              想自己挑范围和模式？用「自定义训练」
            </button>
          </div>
        </div>
      )}

      {phase === "setup" && !brief && (
        <div className="train-setup">
          <div className="daily-entry" onClick={() => setBrief(true)} role="button" tabIndex={0}>
            <div className="de-ic" aria-hidden="true" />
            <div className="de-m">
              <div className="de-t">今日模式</div>
              <div className="de-s">先看看今天要做什么，可以取消不想做的</div>
            </div>
            <span className="de-go">查看 →</span>
          </div>
          <div className="section-row">
            <h2 className="section-h">自定义训练</h2>
            <span className="section-sub">想自己挑范围和模式？在这里设置</span>
          </div>

          <div className="setup-card">
            <div className="setup-label">① 词源</div>
            <div className="tabs">
              <button
                className={"tab" + (source === "book" ? " active" : "")}
                onClick={() => setSource("book")}
              >
                教材词库
              </button>
              {sync.user ? (
                <button
                  className={"tab" + (source === "custom" ? " active" : "")}
                  onClick={() => setSource("custom")}
                >
                  我的词表（{customWords.length}）
                </button>
              ) : (
                <span className="tab muted-tab" title="登录后可用" style={{ opacity: 0.5 }}>
                  我的词表（需登录）
                </span>
              )}
            </div>

            {source === "custom" && customWords.length === 0 && (
              <div className="setup-hint">
                我的词表还没有词 — 去 <a className="link" href="/mywords">我的词表</a> 导入即可在这里练
              </div>
            )}

            <div className="setup-label">③ 选择年级</div>
            <div className="tabs">
              {GRADES.map((g) => (
                <button
                  key={g.value}
                  className={"tab" + (grade === g.value ? " active" : "")}
                  onClick={() => {
                    setGrade(g.value);
                    setSelSem("all");
                    setSelUnit("all");
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <div className="setup-label">④ 选择范围</div>
            <div className="duo-sel">
              <div className="sel-wrap">
                <span className="sel-cap">学期</span>
                <select
                  value={selSem}
                  onChange={(e) => {
                    setSelSem(e.target.value);
                    setSelUnit("all");
                  }}
                >
                  <option value="all">全部学期</option>
                  <option value="1">上册</option>
                  <option value="2">下册</option>
                </select>
              </div>
              <div className="sel-wrap">
                <span className="sel-cap">单元</span>
                <select value={selUnit} onChange={(e) => setSelUnit(e.target.value)}>
                  <option value="all">全部单元</option>
                  {availableUnits.map((u) => (
                    <option key={u.v} value={u.v}>{u.t}</option>
                  ))}
                </select>
              </div>
            </div>
            {grade !== 0 && (
              <div className="sel-range">当前范围 <b>{pool.length}</b> 个单词</div>
            )}

            <div className="setup-label">⑤ 词条类型</div>
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

            <div className="setup-label">⑥ 训练模式</div>
            <div className="mode-grid">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  className={"mode-card" + (mode === m.key ? " active" : "")}
                  onClick={() => setMode(m.key)}
                >
                  <div className="mode-name">{m.label}</div>
                  <div className="mode-desc">{m.desc}</div>
                </button>
              ))}
            </div>

            <div className="setup-label">⑦ 题量</div>
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

      {/* 退出本轮（2026-09-30 B2）：以前进行中界面**没有任何出口**，
          用户只能答完或关掉页面。已答的题已经写进记忆曲线，退出不会白答。 */}
      {phase === "running" && (
        <div className="run-toolbar">
          <button className="run-exit" onClick={exitRound}>← 退出本轮</button>
          <span className="run-exit-note">已答的题会自动记下来</span>
        </div>
      )}

      {phase === "running" && cur && (mode === "quiz" || mode === "reverse" || mode === "listening") && (
        <div className="train-run">
          <div className="train-coach">
            <PetImage stage={game.state().stage || 1} action={coachAct} size={44} />
          </div>
          <ProgressBar idx={idx} total={deck.length} />
          <div className="run-card">
            {combo >= 2 && <span className="run-combo">🔥 连对 {combo}</span>}
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
          <div className="train-coach">
            <PetImage stage={game.state().stage || 1} action={coachAct} size={44} />
          </div>
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
                不认识
              </button>
              <button className="known-yes" onClick={() => flashKnown(true)}>
                认识
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
          <ResolvePanel
            kind="judge"
            stamp={`正确率 ${
              statsSummary.total
                ? Math.round((statsSummary.correct / statsSummary.total) * 100)
                : 0
            }%`}
            stampTone={statsSummary.total && statsSummary.correct / statsSummary.total >= 0.8 ? "fin" : "normal"}
            kpis={[
              { label: "答对", value: statsSummary.correct },
              { label: "答错", value: statsSummary.total - statsSummary.correct },
              { label: "消灭错词", value: clearedCount },
              { label: "XP", value: `+${statsSummary.correct * 2 + clearedCount * 10}` },
            ]}
            list={wrongPool.map((w) => ({
              word: w.word_en.replace(/^\*/, ""),
              mark: "错",
              def: w.definition_zh,
              tag: "错题本",
            }))}
            actions={[
              wrongPool.length > 0
                ? { label: `错词再战（${wrongPool.length}）`, primary: true, onClick: practiceWrong }
                : daily
                ? { label: "再练一轮", primary: true, onClick: startDaily }
                : { label: "再来一次", primary: true, onClick: buildDeck },
              daily
                ? { label: "去单元测验", href: "/exam" }
                : { label: "返回设置", onClick: () => { setDaily(false); setPhase("setup"); } },
              { label: daily ? "返回首页" : "返回设置", href: daily ? "/" : undefined, onClick: daily ? undefined : () => { setDaily(false); setPhase("setup"); } },
            ]}
          />
        </div>
      )}
    </div>
  );
}
