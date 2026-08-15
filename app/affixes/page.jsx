"use client";

import { useEffect, useMemo, useState } from "react";
import { loadAffixes } from "@/lib/loadWords";
import { speak } from "@/lib/tts";

const GROUPS = [
  { key: "prefixes", label: "前缀 Prefix", icon: "➡️" },
  { key: "suffixes", label: "后缀 Suffix", icon: "⬅️" },
  { key: "roots", label: "词根 Root", icon: "🧩" },
];

export default function AffixesPage() {
  const [data, setData] = useState(null);
  const [group, setGroup] = useState("prefixes");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);

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

  return (
    <div className="wrap">
      <header className="hero">
        <div className="brand">
          <h1>词根词缀库</h1>
          <span className="en">Roots &amp; Affixes</span>
        </div>
        <p className="tagline">
          共 {data.prefixes.length + data.suffixes.length + data.roots.length} 个词缀词根 ·
          关联词库 {data.roots.reduce((s, a) => s + a.count, 0) + data.prefixes.reduce((s, a) => s + a.count, 0) + data.suffixes.reduce((s, a) => s + a.count, 0)} 个单词 · 点击词缀查看关联单词
        </p>
      </header>

      <div className="controls">
        <input
          className="search"
          placeholder="搜索词缀/词根，如 re、-tion、port"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="tabs">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              className={"tab" + (group === g.key ? " active" : "")}
              onClick={() => {
                setGroup(g.key);
                setOpen(null);
              }}
            >
              {g.icon} {g.label} <b>{data[g.key].length}</b>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 && <div className="empty-state">没有匹配的词缀，换个关键词。</div>}

      <div className="affix-list">
        {list.map((a) => (
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

      <footer className="footer">
        词根词缀提示由词典规则生成并人工校对 · 仅供参考记忆
      </footer>
    </div>
  );
}
