// 全局错误边界（页面/布局子树出错时兜底）——纸墨风，杜绝白屏
//
// 2026-09-22 修正：ChunkLoadError（构建后 chunk hash 变了、浏览器还拿着旧页面壳）
// 不能用 reset() 恢复 —— 必须整页重载。见 lib/recover.js 注释。
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PetImage from "./components/PetImage";
import { autoRecover, forceReload, isChunkLoadError } from "@/lib/recover";

export default function Error({ error, reset }) {
  const chunkErr = isChunkLoadError(error);
  const [stuck, setStuck] = useState(false);

  // chunk 拿不到 → 自动整页重载一次（冷却期内不重复，避免死循环）
  useEffect(() => {
    if (!chunkErr) return;
    if (!autoRecover(error)) setStuck(true);
  }, [chunkErr, error]);

  return (
    <div className="err-page">
      <div className="err-card">
        <div className="err-stamp">出错了</div>
        <div className="err-pet">
          <PetImage stage={1} action="sleep" size={96} />
        </div>
        <div className="err-big">
          {chunkErr ? "页面版本对不上了" : "页面试纸被风吹走了"}
        </div>
        <div className="err-sub">
          {chunkErr ? (
            <>
              浏览器缓存的那一版页面，和服务器现在的版本对不上。
              <br />
              {stuck
                ? "自动重载过一次还是不行，请按 Ctrl + F5 强制刷新。"
                : "正在自动重新加载最新版本…"}
            </>
          ) : (
            <>
              刚才的操作遇到了一点问题，跃跃先去眯一会儿。
              <br />
              重新试试，应该就好了。
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
          <Link className="err-btn ghost" href="/">回主页</Link>
        </div>
      </div>
    </div>
  );
}
