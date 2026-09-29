"use client";

// ============================================================
// app/confusable/page.jsx —— 易混词对比（新增页，2026-09-15）
// 数据源：lib/builtin-kb.js 的 CONFUSABLES（51 对中考高频辨析点）
// 展示：词对 + 各自在词库的位置（X 年级X册 Ux）/ 词义 + 辨析 note + 朗读
// 入口：书壳左栏附录区 E 易混词对比 + 词料库页底部链接
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { loadWords } from "@/lib/loadWords";
import { CONFUSABLES } from "@/lib/builtin-kb";
import { speak } from "@/lib/tts";
import PetEmpty from "../components/PetEmpty";
import { pageWindow, pagerInfo } from "@/lib/paging";

export default function ConfusablePage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1); // 分页（分页纪律：>12 条必须分页）
  const PAGE_SIZE = 5; // 用户定：5 对/页（51 对 → 11 页），一屏能看全，不用往下划

  useEffect(() => {
    loadWords().then(setData).catch(() => {});
  }, []);

  // 词库索引：word_en(小写) → 位置标签
  const wordMap = useMemo(() => {
    const m = new Map();
    if (data) {
      data.words.forEach((w) => {
        if (!m.has(String(w.word_en).toLowerCase())) {
          m.set(String(w.word_en).toLowerCase(), {
            label: `${w.grade} 年级${w.semester === 1 ? "上" : "下"}册 U${w.unit}`,
            word_en: w.word_en.replace(/^\*/, ""),
            phonetic: w.phonetic,
            definition_zh: w.definition_zh,
          });
        }
      });
    }
    return m;
  }, [data]);

  const list = useMemo(() => {
    if (!CONFUSABLES) return [];
    const q = query.trim().toLowerCase();
    let arr = CONFUSABLES;
    if (q) {
      arr = arr.filter(
        (c) =>
          c.a.toLowerCase().includes(q) ||
          c.b.toLowerCase().includes(q) ||
          c.note.includes(q)
      );
    }
    return arr.map((c) => {
      const ma = wordMap.get(c.a.toLowerCase());
      const mb = wordMap.get(c.b.toLowerCase());
      return {
        a: c.a,
        b: c.b,
        note: c.note,
        aDef: ma ? ma.definition_zh : "",
        bDef: mb ? mb.definition_zh : "",
        aWhere: ma ? ma.label : null,
        bWhere: mb ? mb.label : null,
      };
    });
  }, [query, wordMap]);

  if (!data || !CONFUSABLES) {
    return (
      <div className="wrap">
        <PetEmpty title="加载易混词…" sub="跃跃在整理辨析卡片" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const slice = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <div className="wrap cf-wrap">
      <header className="hero">
        <div className="brand">
          <h1>易混词对比</h1>
          <span className="en">Confusable Pairs</span>
        </div>
        <p className="tagline">
          中考/教材高频辨析点 · {CONFUSABLES.length} 对 · 词源标注来自课本词库
        </p>
      </header>

      <div className="controls">
        <input
          className="search"
          placeholder="搜词，如 spend / little / bring"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1); // 改关键词自动回第 1 页
          }}
        />
      </div>

      {list.length === 0 && (
        <div className="empty-state">没有匹配的易混词，换个关键词。</div>
      )}

      <div className="cf-list">
        {slice.map((c, i) => (
          <div className="cf-card" key={c.a + c.b + i}>
            <div className="cf-pair">
              <div className="cf-word">
                <button
                  className="cf-speak"
                  onClick={() => speak(c.a)}
                  aria-label={`朗读 ${c.a}`}
                >
                  🔊
                </button>
                <b>{c.a}</b>
                {c.aDef && <span className="cf-def">{c.aDef}</span>}
                {c.aWhere && <span className="cf-where">{c.aWhere}</span>}
                {!c.aWhere && <span className="cf-where new">新词（词库外）</span>}
              </div>
              <span className="cf-vs">vs</span>
              <div className="cf-word">
                <button
                  className="cf-speak"
                  onClick={() => speak(c.b)}
                  aria-label={`朗读 ${c.b}`}
                >
                  🔊
                </button>
                <b>{c.b}</b>
                {c.bDef && <span className="cf-def">{c.bDef}</span>}
                {c.bWhere && <span className="cf-where">{c.bWhere}</span>}
                {!c.bWhere && <span className="cf-where new">新词（词库外）</span>}
              </div>
            </div>
            <div className="cf-note">{c.note}</div>
          </div>
        ))}
      </div>

      {/* 翻页条（分页纪律：大篇幅列举必须分页） */}
      {totalPages > 1 && (
        <nav className="pg-pager" aria-label="易混词分页">
          <button
            className="pg-btn"
            disabled={cur === 1}
            onClick={() => setPage(cur - 1)}
          >
            ‹ 上一页
          </button>
          {pageWindow(cur, totalPages).map((n, i) =>
            n === "…" ? (
              <span className="pg-gap" key={"gap" + i}>
                …
              </span>
            ) : (
              <button
                key={n}
                className={"pg-num" + (n === cur ? " on" : "")}
                aria-current={n === cur ? "page" : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            )
          )}
          <button
            className="pg-btn"
            disabled={cur === totalPages}
            onClick={() => setPage(cur + 1)}
          >
            下一页 ›
          </button>
          <span className="pg-info">{pagerInfo(cur, PAGE_SIZE, list.length, "对")}</span>
        </nav>
      )}
    </div>
  );
}