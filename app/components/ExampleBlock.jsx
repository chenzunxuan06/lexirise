"use client";

import { speak, speakZh } from "@/lib/tts";

/** 例句展示块（英 + 中 + 双语音频），全站复用 */
export default function ExampleBlock({ w, compact = false }) {
  const en = w && w.example_en;
  const zh = w && w.example_zh;
  if (!en) return null;
  return (
    <div className={"example" + (compact ? " compact" : "")}>
      <div className="label-row">
        <span className="label">EXAMPLE</span>
        <span className="ex-btns">
          <button className="mini-speak" title="朗读英文" onClick={() => speak(en)}>🔊</button>
          {zh && (
            <button className="mini-speak zh" title="朗读中文" onClick={() => speakZh(zh)}>🀄</button>
          )}
        </span>
      </div>
      <div className="en">{en}</div>
      {zh && <div className="zh">{zh}</div>}
    </div>
  );
}
