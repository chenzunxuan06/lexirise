"use client";

// ============================================================
// app/components/ExampleBlock.jsx —— 例句展示块（全站复用）
// ------------------------------------------------------------
// 展示优先级（词跃-课文语料索引方案.md §5）：
//   ① 课本原句（有语料索引时优先）—— 带出处，学生能指着说"这是我们课本上那句"
//   ② 现有抓取例句（568 条，保留作兜底，不要删）
//   ③ 都没有 → 整块隐藏
//
// 【为什么接在这里】全站只有这一个例句展示点，四处
// （vocab / review / recite / train）全部复用它 ——
// 和"答题日志埋在 record() 里"是同一个思路：**一个改动点，不可能漏**。
//
// ⚠️ 安全前提（已逐处核对）：四个调用点**全部在答完 / 翻面 / 显示释义之后**。
//    课本原句里就含目标词，答前显示等于送答案。
//    **以后新增调用点，必须先确认它在答完之后。**
// ============================================================

import { useEffect, useState } from "react";
import { speak, speakZh } from "@/lib/tts";
import { sentencesForWord } from "@/lib/corpus";

/** 例句展示块（课本原句 + 兜底例句，英 + 中 + 双语音频） */
export default function ExampleBlock({ w, compact = false }) {
  const en = w && w.example_en;
  const zh = w && w.example_zh;
  const id = w && w.id;

  // 课本原句。compact（答题过程中的反馈）只给 1 句，详情页给 2 句 —— 克制优先。
  const [tb, setTb] = useState(null);
  useEffect(() => {
    if (id === undefined || id === null) {
      setTb(null);
      return undefined;
    }
    let alive = true;
    sentencesForWord(w, compact ? 1 : 2).then((list) => {
      if (alive) setTb(list);
    });
    return () => {
      alive = false;
    };
    // 只依赖 id 与 compact：同一个词的 grade/semester 不会变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, compact]);

  const tbList = tb && tb.length ? tb : null;
  if (!en && !tbList) return null;

  return (
    <>
      {tbList && (
        <div className={"tb-ex" + (compact ? " compact" : "")}>
          <div className="label-row">
            <span className="label">课本原句</span>
            <span className="ex-btns">
              <button className="mini-speak" title="朗读英文" onClick={() => speak(tbList[0].text)}>
                🔊
              </button>
            </span>
          </div>
          {tbList.map((it) => (
            <div className="tbi" key={it.id}>
              <div className="en">{it.text}</div>
              {it.source ? <div className="src">{it.source}</div> : null}
            </div>
          ))}
        </div>
      )}

      {en && (
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
      )}
    </>
  );
}
