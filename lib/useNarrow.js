// ============================================================
// lib/useNarrow.js —— 窄屏判定（≤900px）的唯一来源
// ------------------------------------------------------------
// 900px 在本项目里不是随便一个数字，它是**结构与版式的分界线**：
//   ShellHost 用它决定渲染窄头还是三栏书壳；
//   .bs-narrow 的页面级 padding、@media (max-width: 900px) 的历史段，
//   桌面零回归的判据（纪律 7）—— 都在这一条线上。
//
// M2 时这个判断写在 ShellHost.jsx 内部（组件私有）。M5 开始，
// 首页目录折叠（BookToc）、/vocab 默认年级、/settings 版式卡都要问
// 同一个问题 —— 于是提出来一份，别再各写各的。
// 与 lib/nav.js 同一个道理：**一个判断只有一个来源**。
//
// 首帧 false 保证 SSR 与水合一致（服务端不知道视口宽），挂载后立刻校正。
// ============================================================

import { useEffect, useState } from "react";

export const NARROW_QUERY = "(max-width: 900px)";

export function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export default useNarrow;
