"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadWords, wordOfTheDay } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { memory, wrongBook, favs, stats, plan } from "@/lib/memory";
import ExampleBlock from "./components/ExampleBlock";

function GoalRing({ done, goal }) {
  const pct = goal ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="goal-ring">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle
          cx="65"
          cy="65"
          r={R}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
        <text x="65" y="61" textAnchor="middle" className="goal-ring-num">
          {pct}%
        </text>
        <text x="65" y="80" textAnchor="middle" className="goal-ring-label">
          今日新学 {done}/{goal}
        </text>
      </svg>
    </div>
  );
}

const GOAL_OPTS = [5, 10, 20, 30, 50];

const MODES = [
  { key: "quiz", label: "选中文", icon: "✅", desc: "看单词选释义" },
  { key: "reverse", label: "选单词", icon: "🔀", desc: "看中文选单词" },
  { key: "flashcard", label: "闪卡", icon: "🃏", desc: "翻卡自测" },
  { key: "dictation", label: "听写", icon: "✍️", desc: "听音拼单词" },
  { key: "listening", label: "听力", icon: "🔊", desc: "听音选释义" },
];

export default function HomePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    loadWords().then(setData).catch((e) => console.error(e));
  }, []);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const [dailyGoal, setDailyGoal] = useState(() => plan.load().dailyNew || 10);
  const [aiOk, setAiOk] = useState(null); // null=未知 true/false

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAiOk(!!d.configured))
      .catch(() => setAiOk(false));
  }, []);

  const words = data ? data.words : [];
  const daily = useMemo(() => wordOfTheDay(words), [words]);

  const due = useMemo(() => memory.dueWords(words).length, [words, tick]);
  const newCount = useMemo(() => memory.newCount(words), [words, tick]);
  const wrongN = wrongBook.count();
  const favN = favs.count();
  const today = stats.today();
  const streak = stats.streakDays();
  const learned = memory.learnedCount();
  const mastered = memory.masteredCount();

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词库中…</div></div>;
  }

  return (
    <div className="wrap">
      <header className="hero home-hero">
        <div className="brand">
          <h1>词跃 LexiRise</h1>
          <span className="en">初中英语 · 沪教牛津版</span>
        </div>
        <p className="tagline">
          围绕单词的科学记忆：选择 · 闪卡 · 听写 · 听力 · 词根词缀 · 记忆曲线
        </p>
        <div className="stats">
          <span className="stat">词库 <b>{data.meta.total}</b> 词</span>
          <span className="stat">已学 <b>{learned}</b></span>
          <span className="stat">掌握 <b>{mastered}</b></span>
          <span className="stat">连续打卡 <b>🔥 {streak}</b> 天</span>
        </div>
      </header>

      {daily && (
        <section className="daily-card">
          <div className="daily-head">
            <span className="daily-tag">📅 每日一词</span>
            <span className="daily-date">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</span>
          </div>
          <div className="daily-body">
            <div className="daily-left">
              <div className="daily-word">
                {daily.word_en}
                <button
                  className="speak"
                  onClick={() => speak(daily.word_en)}
                  title="朗读"
                >
                  🔊
                </button>
              </div>
              {daily.phonetic && <div className="daily-phon">{daily.phonetic}</div>}
              <div className="daily-def">
                {daily.pos ? <span className="badge">{daily.pos}</span> : null}
                <span>{daily.definition_zh}</span>
              </div>
              {daily.affix_hint && (
                <div className="daily-affix">🧩 {daily.affix_hint}</div>
              )}
              <div className="daily-example">
                <ExampleBlock w={daily} compact />
              </div>
            </div>
            <div className="daily-right">
              <Link className="start-btn" href={`/train?mode=quiz&word=${daily.id}`}>
                背这个词 →
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="goal-card">
        <div className="goal-info">
          <div className="goal-title">🎯 今日目标</div>
          <div className="goal-stats">
            <div className="goal-stat">
              <div className="goal-stat-num">{today.n}</div>
              <div className="goal-stat-label">新学</div>
            </div>
            <div className="goal-stat">
              <div className="goal-stat-num">{today.review}</div>
              <div className="goal-stat-label">复习</div>
            </div>
            <div className="goal-stat">
              <div className="goal-stat-num">{today.correct}</div>
              <div className="goal-stat-label">答对</div>
            </div>
          </div>
          <div className="goal-set">
            <span className="goal-set-label">每日目标：</span>
            <div className="tabs mini-tabs">
              {GOAL_OPTS.map((g) => (
                <button
                  key={g}
                  className={"tab" + (dailyGoal === g ? " active" : "")}
                  onClick={() => {
                    setDailyGoal(g);
                    plan.setDailyNew(g);
                  }}
                >
                  {g} 词
                </button>
              ))}
            </div>
          </div>
        </div>
        <GoalRing done={today.n} goal={dailyGoal} />
      </section>

      <section className="task-grid">
        <div className="task-card">
          <div className="task-ic">🔁</div>
          <div className="task-main">
            <div className="task-num">{due}</div>
            <div className="task-label">待复习（记忆曲线到期）</div>
          </div>
          <Link className="task-link" href="/review">去复习 →</Link>
        </div>
        <div className="task-card">
          <div className="task-ic">🆕</div>
          <div className="task-main">
            <div className="task-num">{newCount}</div>
            <div className="task-label">未学习的新词</div>
          </div>
          <Link className="task-link" href="/train">去背新词 →</Link>
        </div>
        <div className="task-card">
          <div className="task-ic">❌</div>
          <div className="task-main">
            <div className="task-num">{wrongN}</div>
            <div className="task-label">错题本</div>
          </div>
          <Link className="task-link" href="/review?tab=wrong">去攻克 →</Link>
        </div>
        <div className="task-card">
          <div className="task-ic">⭐</div>
          <div className="task-main">
            <div className="task-num">{favN}</div>
            <div className="task-label">生词本</div>
          </div>
          <Link className="task-link" href="/review?tab=favs">去翻看 →</Link>
        </div>
      </section>

      {aiOk === true && (
        <section className="ai-practice-card">
          <div className="ai-prac-left">
            <div className="ai-prac-title">✨ 今日 AI 练习</div>
            <div className="ai-prac-desc">
              按你的记忆曲线到期词 + 错题本自动出 10 题（选词填空 / 拼写 / 词形变化），
              做完自动回写记忆曲线，答错进错题本。
            </div>
          </div>
          <Link className="start-btn" href="/practice?auto=1">
            开始练习 →
          </Link>
        </section>
      )}

      <section className="home-section">
        <div className="section-row">
          <h2 className="section-h">快速开始训练</h2>
          <span className="section-sub">今日已学 {today.n + today.review} 词 · 正确 {today.correct} 次</span>
        </div>
        <div className="mode-grid home-modes">
          {MODES.map((m) => (
            <Link key={m.key} href={`/train?mode=${m.key}`} className="mode-card">
              <div className="mode-icon">{m.icon}</div>
              <div className="mode-name">{m.label}</div>
              <div className="mode-desc">{m.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <h2 className="section-h">学习中心</h2>
        <div className="entry-grid">
          <Link href="/recite" className="entry-card">
            <span className="entry-ic">📖</span>
            <span className="entry-name">背书</span>
            <span className="entry-desc">按学期/单元逐词背诵</span>
          </Link>
          <Link href="/exam" className="entry-card">
            <span className="entry-ic">📝</span>
            <span className="entry-name">单元测验</span>
            <span className="entry-desc">限时考试 · 出分 · 错题报告</span>
          </Link>
          <Link href="/vocab" className="entry-card">
            <span className="entry-ic">📚</span>
            <span className="entry-name">词库</span>
            <span className="entry-desc">按年级/单元浏览、搜索、收藏</span>
          </Link>
          <Link href="/phrases" className="entry-card">
            <span className="entry-ic">💬</span>
            <span className="entry-name">短语专项</span>
            <span className="entry-desc">399 条固定搭配 · 中考高频</span>
          </Link>
          <Link href="/mywords" className="entry-card">
            <span className="entry-ic">📋</span>
            <span className="entry-name">我的词表</span>
            <span className="entry-desc">导入自建词表 · 登录同步</span>
          </Link>
          <Link href="/affixes" className="entry-card">
            <span className="entry-ic">🧩</span>
            <span className="entry-name">词根词缀</span>
            <span className="entry-desc">前缀 · 后缀 · 词根 速查库</span>
          </Link>
          <Link href="/stats" className="entry-card">
            <span className="entry-ic">📈</span>
            <span className="entry-name">学习统计</span>
            <span className="entry-desc">打卡热力图 · 掌握进度</span>
          </Link>
        </div>
      </section>

      <footer className="footer">
        词跃 LexiRise · 沪教牛津版 {data.meta.total} 词 · 数据保存在本机浏览器
      </footer>
    </div>
  );
}
