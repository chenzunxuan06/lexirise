"use client";

// ============================================================
// app/components/BookToc.jsx —— 目录页（乙案 · 今日页）真实数据版
// ------------------------------------------------------------
// 六册大纲（左栏 TocRail 同源）+ 当前册单元目录行 + 动作行展开
// 数字纪律：只出现"今天 N / 还剩 N / 已背 N / N%"，不出现整册总量。
// 放大预览：单元目录行（ZoomList）悬停/聚焦放大、其余退淡，再点进入。
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memory, onChange } from "@/lib/memory";
import { todaySummary } from "@/lib/progress";
import { loadWords } from "@/lib/loadWords";
import { speak } from "@/lib/tts";
import { StBar, MRow, WRow, ZoomList } from "./rows";
import { useCatalog, useBookCtx, dotFor } from "./BookShell";

export default function BookToc() {
  const router = useRouter();
  const catalog = useCatalog();
  const { book: ctxBook } = useBookCtx();
  const [openUnit, setOpenUnit] = useState(null); // 展开的单元目录行（保留以高亮当前行）
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState(ctxBook || null);

  useEffect(() => {
    const off = onChange(() => setTick((x) => x + 1));
    return off;
  }, []);

  // 与左栏联动：左栏点了册，这里跟着切
  useEffect(() => {
    if (ctxBook) setSel(ctxBook);
  }, [ctxBook]);

  const book = useMemo(() => {
    if (!catalog) return null;
    if (sel && catalog.books.find((b) => b.short === sel.short)) {
      return catalog.books.find((b) => b.short === sel.short);
    }
    return catalog.books[2] || null; // 默认八上（与 demo 一致）
  }, [catalog, sel]);

  const sum = useMemo(
    () => (catalog && catalog.words.length ? todaySummary(catalog.words) : null),
    [catalog, tick]
  );

  // B4 口径统一：不再有"合计"，只有两块 —— 复习（到期+错题）与 新词（可选择）
  const revCount = sum ? sum.review.count : 0;
  const freshCount = sum ? sum.fresh : 0;
  const twoEmpty = revCount === 0 && freshCount === 0;

  if (!catalog || !book) return null;

  return (
    <div className="bs-toc">
      {/* 快路径：今日状态行（一屏一个大行动） */}
      <StBar
        variant={twoEmpty ? "fin" : "normal"}
        icon="▶"
        title={
          twoEmpty
            ? "今天已完成"
            : freshCount > 0
            ? `复习 ${revCount} 词 · 新词 ${freshCount} 词`
            : `复习 ${revCount} 词`
        }
        desc={
          twoEmpty
            ? "全部打完卡，明天见"
            : `到期 ${sum.review.due} · 错题 ${sum.review.wrong}` +
              (sum.review.deferred > 0 ? ` · 另有 ${sum.review.deferred} 个顺延到明天` : "") +
              ` · 新词 ${freshCount}`
        }
        go="开始 →"
        onGo={() => router.push("/train?mode=daily")}
      />

      {/* 用所给词的适当形式填空（T20）—— 学校考得最多的题型，词跃此前完全空白。
          放这里而不是顶栏：它不是每天必做的那件事（那是 StBar 的位置），
          而是一个「想练词形变化时找得到」的入口。 */}
      {/* 带上当前册的参数：这样题库页顶部会直接列出本册各单元供切换，
          而不是只能"六册混着抽"。单元级入口在单元页（见 app/unit/page.jsx）。 */}
      <Link href={`/forms?grade=${book.g}&semester=${book.s}`} className="bs-forms-entry">
        <b>✏️ 用所给词的适当形式填空</b>
        <span>课文原句挖空 · 答案就是课文里的那个形式</span>
      </Link>

      {/* 课文挖空（T21）—— 与上面那条互补：那条挖**变形**，这条挖**原形**。
          两套题取的是同一份语料索引里互补的两半（asked=true / asked=false）。 */}
      <Link href={`/cloze?grade=${book.g}&semester=${book.s}`} className="bs-forms-entry">
        <b>📖 课文挖空</b>
        <span>给中文意思，填课文里的那个词</span>
      </Link>

      {/* 当前册标题 */}
      <div className="bs-ct">
        <em>CONTENTS</em>
        {book.name}
      </div>
      <div className="bs-ct-sub">
        已背 <b>{book.done}</b> 词 · <b>{book.pct}%</b>
      </div>
      <div className="bs-ct-line" />

      {/* 单元目录行（放大预览；点行进单元页） */}
      <ZoomList>
        {book.unitList.map((u) => (
          <MRow
            key={u.unit}
            dot={dotFor(u.pct)}
            active={openUnit === u.unit}
            title={`Unit ${u.unit}`}
            meta={
              u.done === 0
                ? `${u.n} 词 · 未开始`
                : u.pct >= 100
                ? `${u.n} 词 · 已背完`
                : `${u.n} 词 · 还剩 ${u.n - u.done}`
            }
            hint={`这次背 ${Math.min(10, Math.max(1, u.n - u.done))} 个 · 约 ${Math.max(2, Math.round(Math.min(10, Math.max(1, u.n - u.done)) * 0.35))} 分钟`}
            onClick={() =>
              router.push(`/unit?grade=${book.g}&semester=${book.s}&unit=${u.unit}`)
            }
          />
        ))}
      </ZoomList>

      {/* 本册词表（词行预览，点喇叭朗读） */}
      <div className="bs-wlist">
        <div className="bs-wlist-h">
          {book.name} · 本册词表
          <Link className="bs-wlist-all" href={`/vocab?grade=${book.g}&semester=${book.s}`}>
            查看全部 ›
          </Link>
        </div>
        {catalog.words
          .filter((w) => w.grade === book.g && w.semester === book.s)
          .slice(0, 12)
          .map((w, i) => (
            <WRow
              key={w.id}
              no={i + 1}
              word={w.word_en}
              phonetic={w.phonetic}
              pos={w.pos}
              def={w.definition_zh}
              dot={dotFor(memory.get(w.id) && memory.get(w.id).lv >= 6 ? 100 : memory.get(w.id) && memory.get(w.id).lv > 0 ? 50 : 0)}
            />
          ))}
        <div className="bs-wlist-more">
          <button className="bs-wlist-all" onClick={() => router.push(`/vocab?grade=${book.g}&semester=${book.s}`)}>
            展开全部 →
          </button>
        </div>
      </div>
    </div>
  );
}