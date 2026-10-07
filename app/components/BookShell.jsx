"use client";

// ============================================================
// app/components/BookShell.jsx —— 方向C「活页本」外壳（阶段 1）
// ------------------------------------------------------------
// 书签条（甲案 5 入口）+ 三栏（左 216 / 中 1fr / 右 240）+ 书口
// 桌面端（>900px）生效；移动端隐藏（沿用经典 BottomTab 导航）。
// 渲染：壳本身无样式冲突；globals.css 末尾 append 的 .bs-* 换肤层。
// 数据：todaySummary 来自 lib/progress.js（统一口径）。
// ============================================================

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { memory, plan, stats, wrongBook, onChange } from "@/lib/memory";
import { todaySummary } from "@/lib/progress";
import { game, onGameChange, petInfo, petStageName } from "@/lib/game";
import { readSettings, onSettingsChange } from "@/lib/settings";
import { openFocus } from "@/lib/focus-ui";
import { todaySummary as focusToday } from "@/lib/focus";
import PetImage from "./PetImage";

/* 当前册上下文：目录页(左栏) ↔ 首页目录(中间栏) 同步 */
const BookCtx = createContext({ book: null, pick: () => {} });
export function useBookCtx() {
  return useContext(BookCtx);
}

const BOOKS = [
  { g: 7, s: 1, short: "七上", name: "七年级上册" },
  { g: 7, s: 2, short: "七下", name: "七年级下册" },
  { g: 8, s: 1, short: "八上", name: "八年级上册" },
  { g: 8, s: 2, short: "八下", name: "八年级下册" },
  { g: 9, s: 1, short: "九上", name: "九年级上册" },
  { g: 9, s: 2, short: "九下", name: "九年级下册" },
];

/**
 * 聚合词库：六册 + 每册单元（单元数来自真实数据，九下=6）
 */
export function useCatalog() {
  const [data, setData] = useState(null);
  useEffect(() => {
    loadWords()
      .then(setData)
      .catch(() => {});
  }, []);
  const catalog = useMemo(() => {
    if (!data || !data.words) return null;
    const m = memory.load();
    const books = BOOKS.map((b) => {
      const ws = data.words.filter(
        (w) => w.grade === b.g && w.semester === b.s
      );
      const units = new Map();
      ws.forEach((w) => {
        if (!w.unit) return;
        if (!units.has(w.unit)) units.set(w.unit, []);
        units.get(w.unit).push(w);
      });
      const unitList = [...units.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([unit, words]) => {
          const done = words.filter((w) => m[w.id] && m[w.id].lv > 0).length;
          return {
            unit,
            n: words.length,
            done,
            pct: Math.round((done / words.length) * 100),
          };
        });
      const done = ws.filter((w) => m[w.id] && m[w.id].lv > 0).length;
      return {
        ...b,
        n: ws.length,
        done,
        pct: Math.round((done / ws.length) * 100),
        unitList,
      };
    });
    return { books, meta: data.meta, words: data.words };
  }, [data]);
  return catalog;
}

/** 状态点颜色（v8 §2.2 只有三种含义） */
export function dotFor(pct) {
  if (pct >= 100) return "#2f7d4f"; // 绿 = 已掌握/背完
  if (pct > 0) return "#c96f38"; // 橙 = 学习中（mid，3.55:1）
  return undefined; // 灰 = 没学过
}

/* ---------------- 左栏 · 目录大纲（全书 · 大纲）· 甲案 2026-09-16 ---------------- */
// 甲案（用户定稿）：左栏 286px；每册两行式（册名 + 百分比 / 进度条 / 「已背 N · 还剩 M」）；
// 附录从「5 行同质灰字」改为「2 列小卡」（标题行含 A/B/C/D/E 字母 + 数字行）。
// 注意：验收脚本按文本匹配 'A 复习中心' 这类串，字母与标题必须在同一文本流（不能拆成块级）。
export function TocRail({ catalog, current, onPick }) {
  if (!catalog) return <div className="bs-dir bs-empty">翻书中…</div>;
  const m = memory.load();
  const dueN = catalog.words.filter((w) => {
    const s = m[w.id];
    return s && s.lv > 0 && s.due <= Date.now();
  }).length;
  const gs = game.state();
  // 累计做题数 = 每日统计累加（数字纪律允许：自己的战果）
  const totalQ = Object.values(stats.load()).reduce((s, d) => s + (d.total || 0), 0);
  const wrongN = wrongBook.count();
  const appendix = [
    { href: "/review", k: "A", t: "复习中心", m: wrongN > 0 ? `到期 ${dueN} · 错题 ${wrongN}` : `今天到期 ${dueN} 词`, wide: false },
    { href: "/stats", k: "B", t: "学习统计", m: totalQ > 0 ? `累计 ${totalQ} 题` : "还没有记录", wide: false },
    { href: "/achievements", k: "C", t: "成就图鉴", m: `Lv.${gs.level || 1}`, wide: false },
    { href: "/ai", k: "D", t: "AI 学习", m: "复习包 · 练习", wide: false },
    { href: "/confusable", k: "E", t: "易混词对比", m: "51 对辨析", wide: true },
  ];
  return (
    <div className="bs-dir">
      <div className="bs-dir-h">全 书 · 大 纲</div>
      {catalog.books.map((b) => (
        <button
          key={b.short}
          className={
            "bs-book" +
            (current && current.short === b.short ? " on" : "") +
            (b.pct >= 100 ? " done" : "")
          }
          onClick={() => onPick && onPick(b)}
        >
          <span className="bs-book-top">
            <b className="bs-book-nm">{b.short}</b>
            <span className="bs-book-pct">
              {b.done === 0 ? "未开始" : b.pct >= 100 ? "已背完" : `${b.pct}%`}
            </span>
          </span>
          <span className="bs-book-bar">
            <i style={{ width: Math.min(100, b.pct) + "%" }} />
          </span>
          <span className="bs-book-sub">
            {b.done === 0 ? `${b.n} 词 · 还没开始` : `已背 ${b.done} 词 · 还剩 ${b.n - b.done}`}
          </span>
        </button>
      ))}
      <div className="bs-dir-h bs-dir-h2">附 录</div>
      <div className="bs-apx">
        {appendix.map((a) => (
          <Link
            key={a.href}
            className={"bs-apx-card bs-vol-link" + (a.wide ? " wide" : "")}
            href={a.href}
          >
            <span className="bs-apx-t">
              <b className="bs-apx-k">{a.k}</b> {a.t}
            </span>
            <span className="bs-apx-m">{a.m}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 右栏 · 今日进度 ---------------- */
export function TodayBar() {
  const [tick, setTick] = useState(0);
  const [gs, setGs] = useState(null);
  const [cats, setCats] = useState(null);

  useEffect(() => {
    const offM = onChange(() => setTick((x) => x + 1));
    const offG = onGameChange(() => setGs(game.state()));
    loadWords().then((d) => setCats(d)).catch(() => {});
    return () => {
      offM();
      offG();
    };
  }, []);

  const words = cats ? cats.words : [];
  const sum = useMemo(() => (words.length ? todaySummary(words) : null), [words, tick]);
  // 纸间专注：今天在屏幕外做了什么。
  // 放右栏而不是今日页，是因为书壳模式下今日页是「目录」，插块会破坏书的感觉；
  // 而右栏每一页都在 —— 关掉覆盖层立刻就能看到，用户 2026-10-05 反馈的就是这一点。
  const focus = useMemo(() => {
    try {
      return focusToday();
    } catch {
      return { count: 0, ms: 0, byUse: {} };
    }
  }, [tick]);
  const goal = plan.load().dailyNew || 10;
  const todayN = stats.today().n;
  const pct = goal ? Math.round((todayN / goal) * 100) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const g = gs || game.state();
  const pet = petInfo();

  // B4 口径统一：不再有"合计"，只有两块 —— 复习（到期+错题，必须做）与 新词（可选择）
  const rev = sum ? sum.review : null;
  const revCount = rev ? rev.count : 0;
  const freshCount = sum ? sum.fresh : 0;
  const learnedAny = memory.learnedCount() > 0;
  const twoEmpty = revCount === 0 && freshCount === 0;
  const doneState = twoEmpty && (todayN > 0 || learnedAny);

  // 三态（v8 §2.6 展示纪律）：空态=引导（guide）/ 正常=墨底 / 完成=印章绿
  const variant = twoEmpty && !learnedAny ? "guide" : doneState ? "fin" : "normal";
  const heading =
    variant === "guide"
      ? "先挑一本要背的"
      : variant === "fin"
      ? "今天已完成"
      : freshCount > 0
      ? `复习 ${revCount} 词 · 新词 ${freshCount} 词`
      : `复习 ${revCount} 词`;
  const sub =
    variant === "guide"
      ? "从左栏选册，或点「今日」看安排"
      : variant === "fin"
      ? `今天背了 ${todayN} 个新词 · ${memory.masteredCount()} 个已掌握`
      : sum
      ? `复习 ${revCount} 词（到期 ${rev.due} · 错题 ${rev.wrong}）· 新词 ${freshCount} 词`
      : "";

  return (
    <div className="bs-side">
      <div className="bs-side-h">今 日 · 进 度</div>
      <div className="bs-ringbox">
        <svg width="122" height="122" viewBox="0 0 122 122">
          <circle cx="61" cy="61" r={R} fill="none" stroke="#e0d9c6" strokeWidth="7" />
          <circle
            cx="61" cy="61" r={R} fill="none" stroke={variant === "fin" ? "#2f7d4f" : "#2a2519"} strokeWidth="7"
            strokeLinecap="round" strokeDasharray={C}
            strokeDashoffset={C * (1 - Math.min(100, pct) / 100)}
            transform="rotate(-90 61 61)"
          />
        </svg>
        <div className="bs-ring-c">
          <div className="p">{Math.min(100, pct)}%</div>
          <div className="l">{todayN} / {goal} 词</div>
        </div>
      </div>
      <Link
        className={"bs-side-go" + (variant === "fin" ? " fin" : "")}
        href="/train?mode=daily"
      >
        {variant === "guide" ? "▶ 选一本书开始" : variant === "fin" ? "▶ 再练一轮巩固" : `▶ 开始今天的学习`}
      </Link>
      <div className="bs-coach">
        <PetImage stage={pet.stage} action={pet.hungry ? "hungry" : "idle"} size={58} />
        <div className="bs-says">
          {sub || (rev && rev.dueAll > 0 ? "有到期复习，先清掉它们最划算。" : "今天没有到期的，学点新的吧。")}
        </div>
      </div>
      {/* 纸间专注：有记录才出现（克制）；点一下能直接再去坐一会儿 */}
      {focus.count > 0 && (
        <div className="bs-focus">
          <div className="bs-focus-h">纸间 · 今天</div>
          {Object.keys(focus.byUse).map((k) => (
            <div className="bs-focus-r" key={k}>
              <span>{k}</span>
              <b>{focus.byUse[k].count} 次</b>
            </div>
          ))}
          <div className="bs-focus-f">
            共 {Math.round(focus.ms / 60000)} 分钟
            <button type="button" onClick={openFocus}>再去 ›</button>
          </div>
        </div>
      )}
      <div className="bs-side-foot">
        Lv.{g.level} {g.title}
      </div>
    </div>
  );
}

/* ---------------- 外壳 · 书签条 + 三栏 ---------------- */
export default function BookShell({ children, currentBook, onPickBook, catalog }) {
  const pathname = usePathname();
  const [shell, setShell] = useState(null); // null = 服务端/首帧（不渲染新壳，防水合闪动）

  useEffect(() => {
    setShell(readSettings().shell || "book");
    return onSettingsChange(() => setShell(readSettings().shell || "book"));
  }, []);

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const g = (typeof window !== "undefined" && game.state()) || null;
  const growthLabel = g ? `成长 Lv.${g.level}` : "成长";

  if (!shell || shell !== "book") return <>{children}</>;

  return (
    <BookCtx.Provider value={{ book: currentBook, pick: onPickBook }}>
      <div className="bs-shell">
        {/* 上栏：单行 + 书签右贴 + 放大字号。
            2026-09-22：丙A 双行版在真实 1240px 宽度下页签又小又空，用户否掉 → 回退。 */}
        <header className="bs-head">
        <Link href="/" className="bs-brand">
          词跃 <small>LEXIRISE · 活页本</small>
        </Link>
        <nav className="bs-tabs" aria-label="书签导航">
          <Link href="/" className={"bs-tab" + (isActive("/") ? " on" : "")}>
            今日
          </Link>
          <Link href="/review" className={"bs-tab" + (isActive("/review") ? " on" : "")}>
            复习
          </Link>
          <Link href="/vocab" className={"bs-tab" + (isActive("/vocab") || isActive("/phrases") || isActive("/affixes") ? " on" : "")}>
            词料库
          </Link>
          <Link href="/achievements" className={"bs-tab" + (isActive("/achievements") || isActive("/stats") ? " on" : "")}>
            {growthLabel}
          </Link>
          <Link href="/settings" className={"bs-tab bs-gear" + (isActive("/settings") ? " on" : "")} aria-label="设置">
            ⚙
          </Link>
          {/* 纸间专注：全局可用，任何页面都能唤起。
              它不是路由，是一层全屏覆盖层（见 app/components/FocusLayer.jsx）。 */}
          <button type="button" className="bs-tab bs-focus-tab" onClick={openFocus} title="纸间专注 —— 去背书、写试卷，我帮你记着">
            专注
          </button>
        </nav>
        <span className="bs-head-meta">
          {new Date().getMonth() + 1}月{new Date().getDate()}日
        </span>
      </header>
      <div className="bs-cols">
        <aside className="bs-lrail">
          <TocRail catalog={catalog} current={currentBook} onPick={onPickBook} />
        </aside>
        <main className="bs-page">
          <div className="bs-pg-head">
            <span className="l">词跃 LexiRise · {(currentBook && currentBook.name) || "目录"}</span>
            <span className="r">· {(currentBook && currentBook.short) || "TODAY"}</span>
          </div>
          <div className="bs-pg-body">{children}</div>
        </main>
        <aside className="bs-rrail">
          <TodayBar />
        </aside>
      </div>
      </div>
    </BookCtx.Provider>
  );
}

export { BOOKS };