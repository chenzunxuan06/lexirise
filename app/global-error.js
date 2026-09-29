// 根布局级错误兜底（连 Sidebar/布局都失败时最后的防线）
// 必须自带 <html><body>；样式自包含（引入 globals.css 依赖最小）
//
// 2026-09-22 修正：区分「chunk 版本对不上」与「普通运行期错误」。
//   前者 reset() 永远救不了（还是同一个旧 bundle，还会去要那个 404 的 chunk），
//   必须整页重载；后者才用 reset()。判断逻辑抽在 lib/recover.js。
"use client";

import { useEffect, useState } from "react";
import "./globals.css";
import { autoRecover, forceReload, isChunkLoadError } from "@/lib/recover";

export default function GlobalError({ error, reset }) {
  const chunkErr = isChunkLoadError(error);
  const [stuck, setStuck] = useState(false);

  // chunk 拿不到 → 自动整页重载一次（冷却期内不重复，避免死循环）
  useEffect(() => {
    if (!chunkErr) return;
    if (!autoRecover(error)) setStuck(true);
  }, [chunkErr, error]);

  return (
    <html lang="zh-CN">
      <body>
        <div className="err-page">
          <div className="err-card">
            <div className="err-stamp">出错了</div>
            <div className="err-big">
              {chunkErr ? "页面版本对不上了" : "整本站台需要重新搭一下纸"}
            </div>
            <div className="err-sub">
              {chunkErr ? (
                <>
                  浏览器上留着的这版页面，和服务器上现在的版本不是同一份
                  （{String(error?.message || "拼块加载失败")}）。
                  <br />
                  {stuck
                    ? "自动重载过一次还是这样，请按 Ctrl + F5 强制刷新；仍然不行就清除本站的站点数据。"
                    : "正在自动重新加载最新版本…"}
                </>
              ) : (
                <>
                  全局出了点问题（{String(error?.message || "unknown")}）。
                  <br />
                  点下面的按钮重试；如果反复出现，请刷新页面。
                </>
              )}
            </div>
            <div className="err-actions">
              <button
                className="err-btn"
                onClick={() => (chunkErr ? forceReload() : reset())}
              >
                {chunkErr ? "重新加载页面" : "再试一次"}
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
