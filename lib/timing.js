"use client";

// ============================================================
// lib/timing.js —— 作答用时（反应时）
// ------------------------------------------------------------
// 为什么要有这个文件，而不是在每个页面各写一次 Date.now()：
//   **这个字段已经空了一整天了。**
//   lib/memory.js 早就写着 elapsed: ctx.elapsed || 0，
//   日志表、上报白名单、证据层全都建好了 —— 但全仓 7 个 memory.record 调用点
//   一个都没传过，所以每条日志里它都是 0。
//
//   而 词跃-作品技术路线图.md §96-104 白纸黑字写着：
//     elapsed_ms = 「支撑线 1（弱自评条件下的记忆状态估计）的核心输入」
//   同一份文档还说，这条线「是整条路线里性价比最高的一步」，
//   而且「是唯一不能加速的东西 —— 数据只能靠时间积累」。
//
//   换句话说：**别的都能加班补，这个补不回来。**
//   所以计时这件事必须只有一个实现、一个口径，不能靠七个地方各自记得。
//
// 用法：
//   const elapsedMs = useQuestionTimer(cur && cur.word.id);
//   ...
//   memory.record(w.id, ok, isNew, { mode: "train", elapsed: elapsedMs() });
//
// ⚠️ 两点口气必须一致，否则数据没法用：
//   ① 计时起点是**这道题出现在屏幕上的那一刻**，不是页面加载、也不是上一题答完。
//   ② 用 performance.now()（单调时钟）而不是 Date.now()（墙上时钟）：
//      后者会被系统对时、休眠唤醒改动，算出来的时长可能凭空变成负数或几小时。
// ============================================================

import { useEffect, useRef } from "react";

function nowMs() {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}

/**
 * 从 t0 到现在过了多少毫秒。
 *
 * 抽成纯函数只为一件事：**能被测**。
 * 负数一律夹成 0 —— 时钟往回跳时不能记出负的反应时，
 * 那种值进了证据层会把校准曲线整个带偏。
 *
 * @param {number} t0 起表时刻（performance.now() 口径）
 * @returns {number} 毫秒，>= 0
 */
export function elapsedSince(t0) {
  return Math.max(0, Math.round(nowMs() - t0));
}

/**
 * 一题的计时器。
 *
 * @param {*} key 换题信号：换一次就重新起表（通常是题号）
 * @returns {() => number} 取"从这道题出现到现在"的毫秒数
 */
export function useQuestionTimer(key) {
  const t0 = useRef(0);
  if (t0.current === 0) t0.current = nowMs(); // 首次渲染就起表，不等 effect（否则第一题的用时里含"页面还在渲染"那段）
  useEffect(() => {
    t0.current = nowMs();
  }, [key]);

  return function elapsedMs() {
    return elapsedSince(t0.current);
  };
}

export default { useQuestionTimer };
