"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadWords, wordOfTheDay } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, wrongBook, stats, plan, onChange } from "@/lib/memory";
import { todaySummary } from "@/lib/progress";
import { game, onGameChange, petStageName } from "@/lib/game";
import { track } from "@/lib/analytics";
import PetImage from "./components/PetImage";
import useShellMode from "./components/ShellMode";
import BookToc from "./components/BookToc";

function GoalRing({ pct, done, goal }) {
  const R = 44;
  const C = 2 * Math.PI * R;
  return (
    <div className="hm-ringbox">
      <svg width="108" height="108" viewBox="0 0 108 108">
        <defs>
          <linearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c8763a" />
            <stop offset="100%" stopColor="#d98b4e" />
          </linearGradient>
        </defs>
        <circle cx="54" cy="54" r={R} fill="none" stroke="#edf0f8" strokeWidth="11" />
        <circle
          cx="54" cy="54" r={R} fill="none" stroke="url(#goalGrad)" strokeWidth="11"
          strokeLinecap="round" strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(100, pct) / 100)}
          transform="rotate(-90 54 54)"
          style={{
            transition: "stroke-dashoffset 1.2s cubic-bezier(.34,1.25,.5,1)",
            filter: "drop-shadow(0 0 5px rgba(200,118,58,.45))",
          }}
        />
      </svg>
      <div className="hm-ring-c">
        <div className="p">{Math.min(100, pct)}%</div>
        <div className="l">{done}/{goal} 词</div>
      </div>
    </div>
  );
}

const PET_LINES = [
  "今天也要加油鸭！",
  "背完这一轮，我就长大一点～",
  "错词不可怕，消灭它们！",
  "听说你学校的课快到新单元了？",
  "每天 10 分钟，一学期背完整本书！",
];

export default function HomePage() {
  const shellMode = useShellMode();

  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  const [petLine, setPetLine] = useState(null);
  const [gs, setGs] = useState(null); // 游戏化状态
  const [chestReward, setChestReward] = useState(null);
  const [extraOpen, setExtraOpen] = useState(false); // 号外全版
  const [petAct, setPetAct] = useState("idle"); // 封面狐狸动作帧（点击互动）
  const petFlashT = useRef(null);
  function petCheer() {
    setPetAct("cheer");
    setPetLine(PET_LINES[Math.floor(Math.random() * PET_LINES.length)]);
    clearTimeout(petFlashT.current);
    petFlashT.current = setTimeout(() => setPetAct("idle"), 1600);
  }

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
    setGs(game.state());
    const off = onGameChange(() => setGs(game.state()));
    const offM = onChange(() => setTick((x) => x + 1)); // 学习数据变化刷新今日待办
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => {
      clearInterval(t);
      off();
      offM();
    };
  }, []);

  const words = data ? data.words : [];
  const daily = useMemo(() => wordOfTheDay(words), [words]);

  const due = useMemo(() => memory.dueWords(words).length, [words, tick]);
  const wrongN = wrongBook.count();
  const today = stats.today();
  const streak = stats.streakDays();
  const learned = memory.learnedCount();
  const mastered = memory.masteredCount();
  const goal = plan.load().dailyNew || 10;
  const myGrade = plan.load().grade || 0;

  // 今日待学总量（lib/progress.js 唯一口径：与训练页今日模式实际出题数一致）
  const summary = useMemo(() => todaySummary(words), [words, tick]);
  const todoTotal = summary.todo;
  const ringPct = goal ? Math.round((today.n / goal) * 100) : 0;
  const acc = today.total ? Math.round((today.correct / today.total) * 100) : 100;

  // 年级进度微条（新手指引选了年级才显示）
  const gradeProg = useMemo(() => {
    if (!myGrade || !words.length) return null;
    const gw = words.filter((w) => w.grade === myGrade);
    if (!gw.length) return null;
    const m = memory.load();
    const done = gw.filter((w) => m[w.id] && m[w.id].lv > 0).length;
    return { done, total: gw.length, pct: Math.round((done / gw.length) * 100) };
  }, [myGrade, words, tick]);

  const hour = new Date().getHours();
  const greet = hour < 6 ? "夜深了" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  // 今日三件事完成状态
  const taskReviewDone = due === 0 && (today.review > 0 || learned > 0);
  const taskWrongDone = wrongN === 0;
  const taskNewDone = today.n >= goal;
  const tasksDone = [taskReviewDone, taskWrongDone, taskNewDone].filter(Boolean).length;

  // 游戏化展示
  const g = gs || game.state();
  const pet = game.petInfo();
  const chestOk = tasksDone === 3 && game.chestAvailable();
  const ms = g.lastMilestone || null; // 最近里程碑（号外角标）

  // 三件事每完成一件即结算奖励（claimTask 幂等：每天每件只结算一次）
  useEffect(() => {
    if (taskReviewDone) game.claimTask("review");
    if (taskWrongDone) game.claimTask("wrong");
    if (taskNewDone) game.claimTask("new");
  }, [taskReviewDone, taskWrongDone, taskNewDone]);

  if (shellMode === "book") {
    return (
      <div className="wrap bs-home">
        <BookToc />
      </div>
    );
  }

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  return (
    <div className="wrap hm-wrap">
      {/* ===== 封面杂志区（A2 · 状态应征栏） ===== */}
      <section className="mag-cover">
        {/* 报头 */}
        <div className="mag-head">
          <span className="mag-brand">词跃 <small>LEXIRISE MAG</small></span>
          <span className="mag-issue">VOL.{new Date().getMonth() + 1}{new Date().getDate()} · 今日学习</span>
        </div>

        {/* 封面艺术：跃跃肖像 + 大标题 */}
        <div className="mag-art">
          <button
            className="mag-portrait"
            title={`${pet.name} · ${pet.stageName} · 点我互动`}
            onClick={petCheer}
          >
            <PetImage
              stage={pet.stage}
              action={pet.hungry ? "hungry" : petAct}
              size={88}
              className={petAct === "cheer" ? "pet-pop" : "pet-float"}
            />
            <span className="mag-cap">{pet.name} · {pet.stageName}</span>
          </button>
          <div className="mag-big">
            {greet}，今天
            <span className="mag-hl">{todoTotal > 0 ? `${todoTotal} 词` : "已圆满"}</span>
            拿下它
            <small>
              {petLine ||
                (gradeProg
                  ? `${myGrade} 年级已学 ${gradeProg.done}/${gradeProg.total} 词`
                  : pet.line)}
            </small>
          </div>
        </div>

        {/* 状态应征栏（每日状态专栏） */}
        <div className="mag-status">
          <div className="mag-status-t">
            <span className="mag-status-fox">
              <PetImage stage={pet.stage} action={pet.hungry ? "hungry" : "idle"} size={22} round />
            </span>
            专栏 · 每日状态 <small>DAILY STATUS</small>
          </div>
          <div className="mag-status-line">
            {pet.hungry
              ? `跃跃今天缺稿：再学 ${Math.max(0, goal - today.n)} 词，它才有下顿饭吃（学习即稿费）`
              : pet.mood === "happy"
              ? `跃跃今天很开心，已经陪你背了 ${today.total} 题。饱食度 ${pet.hunger}%`
              : `跃跃在等你开场，已攒 ${today.total} 题。饱食度 ${pet.hunger}%——开一轮它就来精神`}
          </div>
          <span className="mag-status-tag">
            {tasksDone === 3
              ? "今日三件事已圆满：宝箱待开启 🎁"
              : `明日预告：消灭 ${wrongN} 个错词，跃跃请你吃"胜利章"`}
          </span>
        </div>

        {/* 三件事编号栏 */}
        <div className="mag-cols">
          <div className={"mag-ci" + (taskReviewDone ? " done" : "")}>
            <span className="no">01</span>复习到期词
            <b>{taskReviewDone ? "✓" : due}</b>
          </div>
          <div className={"mag-ci" + (taskWrongDone ? " done" : "")}>
            <span className="no">02</span>消灭错词
            <b>{taskWrongDone ? "✓" : wrongN}</b>
          </div>
          <div className={"mag-ci" + (taskNewDone ? " done" : "")}>
            <span className="no">03</span>新词学习
            <b>{taskNewDone ? "✓" : Math.max(0, goal - today.n)}</b>
          </div>
        </div>

        {gradeProg && (
          <div className="mag-gprog">
            <div className="mag-gprog-bar"><i style={{ width: gradeProg.pct + "%" }} /></div>
            <span>{myGrade} 年级进度 {gradeProg.pct}%</span>
          </div>
        )}

        {/* 版权行（等级/金币/连击/今日 XP） */}
        <div className="mag-meta">
          Lv.{g.level} {g.title} · ⭐ {g.xp} XP · 🪙 {g.coins} · 🔥 连续 {streak} 天
          · 今日 XP {g.daily.xp}/200
          {!g.daily.firstBonus && <em>首答×2 今日可用 ✨</em>}
        </div>

        <Link className="mag-cta" href="/train?mode=daily">
          {todoTotal > 0 ? `开始今天的学习（${todoTotal} 词）→` : "再练一轮巩固一下 →"}
        </Link>

        {/* 号外角标（里程碑事件） */}
        {ms && !ms.read && (
          <button className="mag-corner" onClick={() => setExtraOpen(true)}>
            <i>!</i>
            <span className="mag-corner-band">号外 · EXTRA</span>
            <span className="mag-corner-tx">🦊 {ms.title} ▶</span>
          </button>
        )}
      </section>

      {/* 号外全版遮罩 */}
      {extraOpen && ms && (
        <div className="mag-ov" onClick={() => setExtraOpen(false)}>
          <div className="mag-extra" onClick={(e) => e.stopPropagation()}>
            <button className="mag-extra-x" onClick={() => setExtraOpen(false)}>✕</button>
            <span className="mag-extra-band">号 外 · EXTRA</span>
            <div className="mag-extra-big">{ms.title}</div>
            <div className="mag-extra-stage">
              <div className="mag-extra-card">
                <PetImage
                  stage={ms.type === "evolve" ? ms.beforeStage : pet.stage}
                  action="idle"
                  size={96}
                />
                <span>{ms.type === "evolve" ? petStageName(ms.beforeStage) : pet.stageName}</span>
              </div>
              <span className="mag-arrow">▶</span>
              <div className="mag-extra-card">
                <PetImage stage={pet.stage} action="cheer" size={96} />
                <span>{pet.stageName}</span>
              </div>
            </div>
            <div className="mag-lede">
              {ms.type === "evolve"
                ? "这不是养成的功劳，是这些词的功劳。下一站：词霸狐。"
                : "坚持就是词霸——每一级都是背出来的。"}
            </div>
            <div className="mag-stats">
              <div><b>Lv.{g.level}</b><span>LEVEL</span></div>
              <div><b>{g.xp}</b><span>XP</span></div>
              <div><b>{streak}天</b><span>连击</span></div>
            </div>
            <button className="mag-cta" onClick={() => { game.markMilestoneRead(); setExtraOpen(false); }}>
              收下号外 →
            </button>
          </div>
        </div>
      )}

      {/* ===== 目标卡 ===== */}
      <section className="hm-goal">
        <GoalRing pct={ringPct} done={today.n} goal={goal} />
        <div className="hm-goal-r">
          <div className="t">
            {todoTotal > 0 ? (
              <>今天还剩 <b>{todoTotal} 词</b></>
            ) : (
              <>🎉 今日任务已完成</>
            )}
          </div>
          <div className="nums">
            <div><b>{today.n}</b><span>已新学</span></div>
            <div><b>{today.review}</b><span>已复习</span></div>
            <div><b>{acc}%</b><span>正确率</span></div>
          </div>
          <Link className="hm-cta" href="/train?mode=daily">
            {todoTotal > 0 ? `▶ 开始今天的学习（${todoTotal} 词）` : "▶ 再练一轮巩固一下"}
            {!g.daily.firstBonus && <small>首答 XP×2 今日可用 ✨</small>}
          </Link>
        </div>
      </section>

      {/* ===== 今日三件事 ===== */}
      <section className="hm-todo">
        <div className="tt">
          <span>今日三件事</span>
          <div className="tt-prog">
            {[taskReviewDone, taskWrongDone, taskNewDone].map((d, i) => (
              <i key={i} className={d ? "on" : ""} />
            ))}
            <span>{tasksDone}/3</span>
          </div>
        </div>
        <Link href="/review" className={"row" + (taskReviewDone ? " done" : "")}>
          <div className="ic" style={{ background: "#e9f9ef" }}>🔁</div>
          <div className="m">复习到期词<small>记忆曲线安排</small></div>
          <div className="st">{taskReviewDone ? <span className="ck">✓</span> : <span className="cnt">{due}</span>}</div>
        </Link>
        <Link href="/review?tab=wrong" className={"row" + (taskWrongDone ? " done" : "")}>
          <div className="ic" style={{ background: "#ffecec" }}>❌</div>
          <div className="m">消灭错词<small>连对 2 次移出错题本</small></div>
          <div className="st">{taskWrongDone ? <span className="ck">✓</span> : <span className="cnt">{wrongN}</span>}</div>
        </Link>
        <Link href="/train?mode=daily" className={"row" + (taskNewDone ? " done" : "")}>
          <div className="ic" style={{ background: "#eaf1ff" }}>🆕</div>
          <div className="m">
            新词学习<small>{myGrade ? `${myGrade} 年级 · 跟学校同步` : "每日目标 " + goal + " 词"}</small>
            <div className="rowbar">
              <i style={{ width: Math.min(100, Math.round((today.n / goal) * 100)) + "%" }} />
            </div>
          </div>
          <div className="st">{taskNewDone ? <span className="ck">✓</span> : <span className="cnt">{Math.max(0, goal - today.n)}</span>}</div>
        </Link>
      </section>

      {/* ===== 开宝箱 ===== */}
      {chestOk && (
        <section className="hm-chest">
          <div className="cc-ic">🎁</div>
          <div className="cc-m">
            <div className="cc-t">三件事全完成，宝箱来啦！</div>
            <div className="cc-s">每天一次，金币 / 皮肤碎片 / 补签卡等你抽</div>
          </div>
          {chestReward ? (
            <div className="cc-res">{chestReward}</div>
          ) : (
            <button className="cc-btn" onClick={() => { track("chest_open"); setChestReward(game.openChest()?.label || "已开过"); }}>
              开 →</button>
          )}
        </section>
      )}

      {/* ===== 每日一词 ===== */}
      {daily && (
        <section className="hm-daily">
          <div className="w">
            <b>{daily.word_en}</b>
            <div>
              {daily.phonetic ? daily.phonetic + " · " : ""}
              {daily.pos ? daily.pos + " " : ""}
              {daily.definition_zh} · 📅 每日一词
            </div>
          </div>
          <button className="spk" onClick={() => speak(daily.word_en)} title="朗读">🔊</button>
        </section>
      )}

      {/* ===== 快捷入口 ===== */}
      <section className="hm-grid">
        <Link href="/recite" className="g"><span className="i">背</span>背书</Link>
        <Link href="/exam" className="g"><span className="i">测</span>单元测验</Link>
        <Link href="/vocab" className="g"><span className="i">库</span>词库</Link>
        <Link href="/phrases" className="g"><span className="i">语</span>短语</Link>
        <Link href="/ai" className="g"><span className="i">AI</span>AI 学习</Link>
        <Link href="/achievements" className="g"><span className="i">成</span>成就</Link>
      </section>

      <footer className="footer">
        词跃 LexiRise · 沪教牛津版同步 · 登录后学习记录云端同步
      </footer>
    </div>
  );
}
