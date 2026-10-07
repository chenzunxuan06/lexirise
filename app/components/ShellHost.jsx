"use client";

// ============================================================
// app/components/ShellHost.jsx —— 活页本外壳宿主（阶段 1 / 阶段 8 修正）
// layout 用：根据 settings.shell 决定是否渲染 BookShell 三栏。
// ⚠️ 窄屏（≤900px）必须直接放行 children，不能渲染 BookShell ——
//    书壳自身 `@media(max-width:900px){.bs-shell{display:none}}` 会把
//    app-main 里的内容一起藏掉（曾导致手机端所有页面空白）。
// ============================================================

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import BookShell, { useCatalog } from "./BookShell";
import FocusLayer from "./FocusLayer";

/** 窄屏判定（≤900px）；首帧 false 保证 SSR 与水合一致 */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export default function ShellHost({ children }) {
  const catalog = useCatalog();
  const [currentBook, setCurrentBook] = useState(null);
  const pathname = usePathname();
  const router = useRouter();
  const narrow = useNarrow();

  // 路由联动：进入 /unit 或 /unit/words 或 /recite 时，左栏按 URL 的 grade/semester 定位到对应册
  useEffect(() => {
    if (!catalog || (!pathname.startsWith("/unit") && !pathname.startsWith("/recite"))) return;
    const q = new URLSearchParams(window.location.search);
    const g = Number(q.get("grade"));
    const s = Number(q.get("semester"));
    if (!g || !s) return;
    const book = catalog.books.find((b) => b.g === g && b.s === s);
    if (book) setCurrentBook(book);
  }, [pathname, catalog]);

  // 左栏点册（修复 2026-09-16）：首页=切目录（现状）；其他页面=跳该册单元总览，
  // 杜绝「头部换了、内容没换」的撒谎状态
  function pickBook(book) {
    setCurrentBook(book); // 头部即时反馈
    if (pathname === "/") return;
    router.push(`/unit?grade=${book.g}&semester=${book.s}`);
  }

  // 窄屏：经典单栏 + 底部导航（复用 BottomTab），书壳不参与；bs-narrow 提供页面级边距
  // 纸间专注挂在 ShellHost 这一层：宽窄两条分支都能用（手机端也要能专注）。
  // 它自己 createPortal 到 body，所以放在 React 树的哪里都不影响覆盖全屏。
  if (narrow)
    return (
      <div className="bs-narrow">
        {children}
        <FocusLayer />
      </div>
    );

  // 设计评审页（/demo）：脱离书壳渲染，便于多方案并排对比
  if (pathname === "/demo") return <>{children}</>;

  return (
    <>
      <BookShell
        catalog={catalog}
        currentBook={currentBook}
        onPickBook={pickBook}
      >
        {children}
      </BookShell>
      <FocusLayer />
    </>
  );
}