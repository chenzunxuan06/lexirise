"use client";

// ============================================================
// app/components/ShellMode.jsx —— 版式开关（活页本 / 经典）
// 服务端首帧返回 null（渲染安全分支），挂载后读取真实设置并订阅变化。
// 供页面组件判断自己该以哪种版式呈现（如首页：book → BookToc）。
// ============================================================

import { useEffect, useState } from "react";
import { readSettings, onSettingsChange } from "@/lib/settings";

export function useShellMode() {
  const [mode, setMode] = useState(null); // null=首帧, "book" | "classic"
  useEffect(() => {
    setMode(readSettings().shell || "book");
    return onSettingsChange(() => setMode(readSettings().shell || "book"));
  }, []);
  return mode;
}

export default useShellMode;