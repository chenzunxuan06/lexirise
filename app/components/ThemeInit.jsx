"use client";

// ============================================================
// ThemeInit —— 主题固定为浅色（深色模式已下线）
// 历史：曾支持 auto/light/dark 三态；因暗夜配色反复无法令用户
// 满意，于 2026-09-06 下线，全站固定浅色纸墨风。
// 代码保留以便将来恢复：改回读取 settings.theme 并响应变化即可
// （readSettings/onSettingsChange/matchMedia 的用法见 git 历史）。
// ============================================================

import { useEffect } from "react";

export default function ThemeInit() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
  }, []);
  return null;
}