"use client";

import { useEffect, useMemo, useState } from "react";
import { loadAffixes } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import LexiTabs from "../components/LexiTabs";
import { pageWindow, pagerInfo } from "@/lib/paging";

const GROUPS = [
  { key: "prefixes", label: "前缀 Prefix" },
  { key: "suffixes", label: "后缀 Suffix" },
  { key: "roots", label: "词根 Root" },
];

export default function AffixesPage() {
  const [data, setData] = useState(null);
  const [group, setGroup] = useState("prefixes");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const [page, setPage] = useState(1); // 分页（分页纪律：>12 条必须分页）
  const PAGE_SIZE = 12;

  useEffect(() => {
    loadAffixes().then(setData).catch((e) => console.error(e));
  }, []);

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let arr = data[group] || [];
    if (q) {
      arr = arr.filter(
        (a) =>
          a.key.toLowerCase().includes(q) ||
          (a.meaning && a.meaning.includes(query.trim())) ||
          (a.en && a.en.toLowerCase().includes(q))
      );
    }
    return arr.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }, [data, group, query]);

  if (!data) {
    return <div className="wrap"><div className="empty-state">加载词根词缀库中…</div></div>;
  }

  const totalMatched = data[group].reduce((s, a) => s + a.count, 0);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const cur = Math.min(page, totalPages);
  const slice = list.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>词根词缀库</h1>
          <span className="en">Roots &amp; Affixes</span>
        </div>
        <p className="tagline">
          词根词缀拆解词义，点击词缀查看关联单词
        </p>
      </header>

      <LexiTabs />

      <div className="controls">
        <input
          className="search"
          placeholder="搜索词缀/词根，如 re、-tion、port"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1); // 改关键词自动回第 1 页
          }}
        />
        <div className="tabs">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              className={"tab" + (group === g.key ? " active" : "")}
              onClick={() => {
                setGroup(g.key);
                setOpen(null);
                setPage(1); // 切组自动回第 1 页
              }}
            >
              {g.label} <b>{data[g.key].length}</b>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && <div className="empty-state">没有匹配的词缀，换个关键词。</div>}

      <div className="affix-list">
        {slice.map((a) => (
          <div className={"affix-item" + (open === a.key ? " open" : "")} key={a.key}>
            <button className="affix-head" onClick={() => setOpen(open === a.key ? null : a.key)}>
              <span className="affix-key">
                {group === "suffixes" ? "-" : ""}
                {a.key}
                {group === "prefixes" ? "-" : ""}
              </span>
              <span className="affix-meaning">{a.meaning}</span>
              <span className="affix-en">{a.en}</span>
              <span className="affix-count">
                <b>{a.count}</b> 词
              </span>
              <span className="affix-arrow">{open === a.key ? "▲" : "▼"}</span>
            </button>
            {open === a.key && (
              <div className="affix-body">
                {a.count === 0 ? (
                  <div className="affix-none">词库暂未收录以该词缀关联的单词</div>
                ) : (
                  <div className="affix-examples">
                    {a.examples.map((e) => (
                      <button
                        className="affix-word"
                        key={e.id}
                        onClick={() => speak(e.w)}
                        title={e.hint || e.def}
                      >
                        <b>{e.w}</b>
                        <span>{e.def}</span>
                        {e.hint && <em title={e.hint}>🧩</em>}
                      </button>
                    ))}
                    {a.count > a.examples.length && (
                      <div className="affix-more">…共 {a.count} 词</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 翻页条（分页纪律） */}
      {totalPages > 1 && (
        <nav className="pg-pager" aria-label="词根词缀分页">
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
          <span className="pg-info">{pagerInfo(cur, PAGE_SIZE, list.length, "条")}</span>
        </nav>
      )}

      <footer className="footer">
        词根词缀提示由词典规则生成并人工校对 · 仅供参考记忆
      </footer>
    </div>
  );
}
