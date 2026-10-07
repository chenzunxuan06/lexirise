"use client";

// ============================================================
// app/cloze/page.jsx —— 「课文挖空」（T21）
// ------------------------------------------------------------
// 依据：词跃-任务单.md  T21：句长 8–20 词、每句挖 1–2 个；挖空后句子仍可读
//
// 与 T20 的分工（互补，不是重复）：
//   T20 挖的是**变形**：课文 "She sings beautifully."，括号给 beautiful，答案 beautifully
//   T21 挖的是**原形**：课文用的就是原形的那 921 处 —— 考"能不能在语境里想起这个词"
//   两套题的素材都来自同一份语料索引，但**取的是互补的两半**：
//   byWordForm 里 asked=true 的 349 处归 T20，asked=false 的 921 处归 T21。
//
// ⚠️ 四条不能动的（与 T20 同源）：
//   ① 答案**只认课文里的那个词**，不自己派生。
//   ② 出处必须显示（每句话都要能翻书核实）。
//   ③ 作答走 memory.record（mode="cloze"），**不要另写一套记录**。
//      多空题按空逐个记 —— 这样每个词都能拿到自己的对错，而不是一题一个结论。
//   ④ 空与答案的顺序必须是**从左到右**的（题库生成时有自检兜底，见 build_cloze.py）。
//
// 【出题范围（2026-10-07 补）】
//   默认还是全册随机 10 道；带 ?grade=&semester=[&unit=] 就按册 / 按单元出题。
//   范围的解析与筛选只在 lib/bank.js 一处 —— 本页与 /forms 共用同一份口径，
//   页面里不自己拼 "年级-学期-单元" 那个键。
// ============================================================

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { memory } from "@/lib/memory";
import { useQuestionTimer } from "@/lib/timing";
import { formatSource } from "@/lib/corpus";
import { parseScope, filterScope, scopeText, unitOptions } from "@/lib/bank";
import ResolvePanel from "../components/ResolvePanel";
import ScopeBar from "../components/ScopeBar";

const ROUND = 10;
const CIRCLED = ["\u2460", "\u2461", "\u2462", "\u2463"];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 判分前的规整：忽略大小写、首尾空白、多余空格、末尾标点 */
function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:]+$/, "");
}

/** 把句子按挖空切成若干段，中间插编号 */
function segments(text, n) {
  const parts = String(text || "").split("______");
  const out = [];
  parts.forEach((seg, i) => {
    out.push({ type: "text", value: seg });
    if (i < parts.length - 1) out.push({ type: "blank", index: i });
  });
  return out;
}

export default function ClozePage() {
  // useSearchParams 在 App Router 里必须待在 Suspense 边界内（否则整页转成客户端渲染）
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <div className="empty-state">加载题库中…</div>
        </div>
      }
    >
      <ClozeInner />
    </Suspense>
  );
}

function ClozeInner() {
  const sp = useSearchParams();
  const scope = useMemo(() => parseScope(sp), [sp]);
  const [bank, setBank] = useState(null);
  const [words, setWords] = useState(null);
  const [deck, setDeck] = useState([]);
  const [idx, setIdx] = useState(0);
  const [inputs, setInputs] = useState([]);
  const [checked, setChecked] = useState(null); // null | { oks: boolean[] }
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetch("/cloze.json").then((r) => r.json()), loadWords()])
      .then(([b, w]) => {
        if (!alive) return;
        setBank((b && b.items) || []);
        setWords((w && w.words) || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 范围筛过之后的题池 —— 组题、计数、空状态全部只看它
  const scoped = useMemo(() => (bank ? filterScope(bank, scope) : null), [bank, scope]);
  // 该册有题的单元（数据来自题库本身，不额外请求 words.json）
  const units = useMemo(() => (bank ? unitOptions(bank, scope) : []), [bank, scope]);

  const buildDeck = useMemo(
    () => () => {
      if (!scoped || !words) return;
      const started = [];
      const fresh = [];
      for (const it of scoped) {
        // 只要有一个空是学过的词，就归入"接得上节奏"的那一堆
        const hit = (it.blanks || []).some((b) => {
          const st = memory.get(String(b.wid));
          return st && st.lv > 0;
        });
        (hit ? started : fresh).push(it);
      }
      const pick = (arr, n) => shuffle(arr).slice(0, Math.max(0, n));
      const s = pick(started, ROUND - 4);
      const d = [...s, ...pick(fresh, ROUND - s.length)].slice(0, ROUND);
      const finalDeck = d.length ? d : pick(scoped, ROUND);
      setDeck(finalDeck);
      setIdx(0);
      setInputs(new Array((finalDeck[0] && finalDeck[0].blanks.length) || 1).fill(""));
      setChecked(null);
      setResults([]);
      setDone(false);
    },
    [scoped, words]
  );

  // 范围一变就重新组题 —— 不这样的话，从"整册"切到"U3"会继续出上一个范围的题
  useEffect(() => {
    if (scoped && words) buildDeck();
  }, [scoped, words, buildDeck]);

  useEffect(() => {
    if (firstRef.current) firstRef.current.focus();
  }, [idx, done]);

  const cur = deck[idx] || null;
  const nBlanks = cur ? cur.blanks.length : 1;
  const elapsedMs = useQuestionTimer(idx);

  const filled = inputs.length === nBlanks && inputs.every((v) => String(v).trim());

  function check() {
    if (!cur || checked || !filled) return;
    const oks = cur.blanks.map((b, i) => norm(inputs[i]) === norm(b.answer));
    // 逐空记录：每个词都拿到自己的对错，进记忆曲线 + 进证据层日志
    cur.blanks.forEach((b, i) => {
      memory.record(String(b.wid), oks[i], false, { mode: "cloze", elapsed: elapsedMs() });
    });
    setChecked({ oks });
    setResults((prev) => [...prev, { item: cur, oks }]);
  }

  function next() {
    if (idx + 1 >= deck.length) {
      setDone(true);
      return;
    }
    const ni = idx + 1;
    setIdx(ni);
    setInputs(new Array((deck[ni] && deck[ni].blanks.length) || 1).fill(""));
    setChecked(null);
  }

  if (!bank) {
    return (
      <div className="wrap">
        <div className="empty-state">加载题库中…</div>
      </div>
    );
  }

  if (bank.length === 0) {
    return (
      <div className="wrap">
        <div className="empty-state">
          还没生成题库。先在 web/ 目录跑一次：
          <br />
          <code>python scripts/build_corpus.py &amp;&amp; python scripts/build_cloze.py</code>
        </div>
      </div>
    );
  }

  // 这个范围一道题都没有（例如某单元课文里可挖的句子太少）。
  // 不能说"题库空了"—— 那是另一回事；这里必须给出走得通的路。
  if (scoped && scoped.length === 0) {
    const all = bank.length;
    return (
      <div className="wrap fm-wrap">
        <ScopeBar scope={scope} units={units} base="/cloze" allHref="/cloze" />
        <div className="empty-state" style={{ marginTop: 18 }}>
          <b>{scopeText(scope)}</b> 还没有题 —— 这个单元的课文里可挖的句子太少。
          <br />
          先练全册（共 {all} 道），或者换一个单元。
        </div>
      </div>
    );
  }

  if (done) {
    const all = results.flatMap((r) => r.oks);
    const correct = all.filter(Boolean).length;
    const pct = all.length ? Math.round((correct / all.length) * 100) : 0;
    const wrong = results.flatMap((r) =>
      r.item.blanks
        .map((b, i) => ({ b, ok: r.oks[i], item: r.item }))
        .filter((x) => !x.ok)
    );
    return (
      <div className="wrap">
        <ResolvePanel
          kind="judge"
          stamp={"正确率 " + pct + "%"}
          stampTone={pct >= 80 ? "fin" : "normal"}
          kpis={[
            { label: "填对", value: correct },
            { label: "填错", value: all.length - correct },
            { label: "空数", value: all.length },
          ]}
          title="没想起来的词（答案就是课文里的那个词）"
          list={wrong.slice(0, 12).map((x) => ({
            word: x.b.answer,
            mark: "错",
            def: (x.b.hint || "") + " · " + formatSource(x.item),
            tag: "挖空",
          }))}
          actions={[
            { label: "再来一组", primary: true, onClick: buildDeck },
            { label: "返回首页", href: "/" },
          ]}
        />
      </div>
    );
  }

  if (!cur) {
    return (
      <div className="wrap">
        <div className="empty-state">正在组题…</div>
      </div>
    );
  }

  const segs = segments(cur.blanked, nBlanks);
  const src = formatSource(cur);

  return (
    <div className="wrap fm-wrap">
      <ScopeBar scope={scope} units={units} base="/cloze" allHref="/cloze" />

      <div className="fm-head">
        <span className="fm-no">
          第 {idx + 1} / {deck.length} 题
        </span>
        <span className="fm-src">{src}</span>
      </div>

      <div className="fm-body">
        <p className="fm-sent">
          {segs.map((seg, i) =>
            seg.type === "text" ? (
              <span key={i}>{seg.value}</span>
            ) : (
              <span
                key={i}
                className={
                  "fm-blank" + (checked ? (checked.oks[seg.index] ? " ok" : " no") : "")
                }
              >
                {checked ? cur.blanks[seg.index].answer : CIRCLED[seg.index]}
              </span>
            )
          )}
        </p>

        <div className="fm-hint">根据课文语境填入缺少的词（答案只认课文里的那个词）</div>

        <div className="cl-rows">
          {cur.blanks.map((b, i) => (
            <div className="cl-row" key={i}>
              <span
                className={
                  "cl-no" + (checked ? (checked.oks[i] ? " ok" : " no") : "")
                }
              >
                {CIRCLED[i]}
              </span>
              <span className="cl-hint">{b.hint || "（无提示）"}</span>
              <input
                ref={i === 0 ? firstRef : null}
                className={
                  "fm-input cl-input" + (checked ? (checked.oks[i] ? " ok" : " no") : "")
                }
                value={inputs[i] || ""}
                disabled={!!checked}
                placeholder="写英文"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => {
                  const v = inputs.slice();
                  v[i] = e.target.value;
                  setInputs(v);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (checked) next();
                  else check();
                }}
              />
            </div>
          ))}
        </div>

        <div className="fm-answer">
          {!checked && (
            <button className="fm-btn primary" onClick={check} disabled={!filled}>
              检查
            </button>
          )}
          {checked && (
            <button className="fm-btn primary" onClick={next}>
              {idx + 1 >= deck.length ? "看结果" : "下一题"}
            </button>
          )}
        </div>

        {checked && (
          <div className={"fm-fb" + (checked.oks.every(Boolean) ? " ok" : " no")}>
            <div className="fm-fb-t">
              {checked.oks.every(Boolean) ? "全对 —— 就是课文里这几个词" : "正确写法见句中绿色部分"}
            </div>
            <div className="fm-fb-s">{cur.full}</div>
            <div className="fm-fb-s fm-fb-src">{src}</div>
          </div>
        )}
      </div>

      <div className="fm-foot">
        <Link href="/">先不练了</Link>
        <span className="fm-tip">每个空都标了中文意思 —— 可以翻书核对</span>
      </div>
    </div>
  );
}
