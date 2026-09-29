"use client";

import { useEffect } from "react";

/** PWA 支持：注册 Service Worker（离线缓存）+ 安装提示 */
export default function PwaSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // 生产模式才注册（开发模式热更新会被 SW 缓存干扰）
    if (process.env.NODE_ENV !== "production") return;

    // 本地一律不注册（2026-09-22 修正）：
    //   `npm run start` 的 NODE_ENV 也是 production，所以上面那道判断拦不住本地。
    //   一旦本地注册了 SW，它会把页面壳（首页等）缓存在浏览器里；之后每次重新 build，
    //   浏览器拿到的都是 SW 里那份旧壳：
    //     · 服务没在跑 → 直接把旧页面端出来（"一刷新还是旧页面"）
    //     · 服务在跑   → 旧壳去要已经 404 的 chunk → Loading chunk N failed
    //   线上（正式域名）才需要 PWA 离线能力，本地不需要，反而天天误导人。
    const h = location.hostname;
    const isLocal =
      h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]" || h.endsWith(".local");
    if (isLocal) {
      // 顺手清掉本机历史遗留下来的 SW 与它的缓存 —— 只改注册逻辑不会注销已注册的那个
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      if (window.caches && caches.keys) {
        caches
          .keys()
          .then((ks) => ks.forEach((k) => caches.delete(k)))
          .catch(() => {});
      }
      return;
    }

    const t = setTimeout(() => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((e) => console.warn("SW 注册失败:", e));
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  return null;
}
