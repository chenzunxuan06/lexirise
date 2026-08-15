"use client";

import { useEffect } from "react";

/** PWA 支持：注册 Service Worker（离线缓存）+ 安装提示 */
export default function PwaSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 生产模式才注册（开发模式热更新会被 SW 缓存干扰）
    if (process.env.NODE_ENV !== "production") return;

    const t = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((e) => console.warn("SW 注册失败:", e));
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}
