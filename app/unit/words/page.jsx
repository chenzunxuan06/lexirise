"use client";

// ============================================================
// app/unit/words/page.jsx —— 词表页（方向C 阶段 2）
// URL: /unit/words?grade=8&semester=1&unit=3[&print=1]
// 规则：按单元顺序 1–45 一条直线（词库原始顺序）；无词性的词不渲染空位、
//   无音标的词不画音标位；affix_hint 印在词下；⎙ 打印（打印样式不印深色块）。
// ============================================================

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { loadWords } from "@/lib/loadWords";
import { memory, onChange } from "@/lib/memory";
import { speak } from "@/lib/tts";
import PetEmpty from "../../components/PetEmpty";
import { dotFor } from "../../components/BookShell";

export default function UnitWordsPage() {
  return (
    <Suspense fallback={<div className="wrap"><PetEmpty title="加载词表…" /></div>}>
      <UnitWordsInner />
    </Suspense>
  );
}

function UnitWordsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const grade = Number(sp.get("grade")) || 8;
  const semester = Number(sp.get("semester")) || 1;
  const unit = Number(sp.get("unit")) || 1;
  const printMode = sp.get("print") === "1";
  const dictMode = sp.get("dict") === "1"; // 默写卷模式：只印中文，留线写英文

  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    loadWords().then(setData).catch(() => {});
    const off = onChange(() => setTick((x) => x + 1));
    return off;
  }, []);

  const unitWords = useMemo(() => {
    if (!data) return [];
    return data.words
      .filter(
        (w) =>
          w.grade === grade &&
          w.semester === semester &&
          w.unit === unit &&
          w.word_en
      )
      .sort((a, b) => a.id - b.id);
  }, [data, grade, semester, unit, tick]);

  // 打印时机（修复 2026-09-22 缺陷）
  // 旧写法 useEffect(..., [unitWords.length]) 有两个毛病：
  //   ① 挂载时先跑一次（此时 length=0、词表还没渲染）→ 打印预览一整页空白；
  //   ② 数据到达后 length 由 0 变 45，effect 再跑一次 → 对话框关掉又立刻弹回（"退不出去"）。
  // 新规则：必须「数据已到 + 本单元确有词条」才允许打印，且整次挂载只打一次。
  const printFiredRef = useRef(false);
  useEffect(() => {
    if (!printMode) return;
    if (!data || unitWords.length === 0) return;
    if (printFiredRef.current) return;
    printFiredRef.current = true;
    // 等一拍让字体与行高落定，避免把上一屏的布局打出去
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, [printMode, data, unitWords.length]);

  // 返回：新标签页直达时没有可回退的历史，router.back() 是死的 → 兜底回单元页
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(`/unit?grade=${grade}&semester=${semester}`);
  }

  if (!data) {
    return (
      <div className="wrap">
        <PetEmpty title="加载词表…" sub="跃跃在翻单词本" />
      </div>
    );
  }

  const m = memory.load();
  const done = unitWords.filter((w) => m[w.id] && m[w.id].lv > 0).length;

  return (
    <div className={"bs-wlist-page" + (printMode ? " printing" : "")}>
      <div className="bs-wlist-head">
        <button className="bs-back" onClick={goBack}>
          ‹ 返回
        </button>
        <div className="bs-wlist-title">
          <b>{grade} 年级{semester === 1 ? "上" : "下"}册 · Unit {unit}</b>
          <span>
            {unitWords.length} 词 · 已背 {done} · 按课本顺序
          </span>
        </div>
        {!dictMode && (
        <div className="bs-wlist-tools">
          <button className="bs-only" onClick={() => window.print()}>
            ⎙ 打印
          </button>
          <Link
            className="bs-only"
            href={`/unit/words?grade=${grade}&semester=${semester}&unit=${unit}&print=1&dict=1`}
          >
            ⎙ 默写卷
          </Link>
          <Link
            className="bs-only"
            href={`/recite?grade=${grade}&semester=${semester}&unit=${unit}`}
          >
            背这一单元 →
          </Link>
        </div>
      )}
      </div>

      {printMode && (
        <div className="bs-wlist-hint no-print">
          <b>已自动打开打印窗口。</b>
          <span>取消打印后，点左上角「‹ 返回」即可回词表；想重打就点「⎙ 打印」。</span>
        </div>
      )}

      <div className="bs-wlist-table">
        {unitWords.length === 0 && (
          <div className="bs-wlist-empty">这个单元暂无词条，请检查册次与单元号。</div>
        )}
        {unitWords.map((w, i) => {
          const st = m[w.id];
          if (dictMode) {
            // 默写卷：序号 + 中文释义 + 实线下划线（学生写英文）；短语不考拼写也列出
            return (
              <div className="bs-wr dict-row" key={w.id}>
                <span className="bs-wr-no">{String(i + 1).padStart(2, "0")}</span>
                <span className="bs-wr-dict-line" aria-hidden="true" />
                <span className="bs-wr-df">{w.definition_zh}</span>
              </div>
            );
          }
          return (
            <div
              className={"bs-wr" + (w.entry_type === "phrase" ? " isph" : "")}
              key={w.id}
            >
              <div className="bs-wr-main">
                <span className="bs-wr-no">{String(i + 1).padStart(2, "0")}</span>
                {w.word_en.startsWith("*") && <span className="bs-wr-star">*</span>}
                <b className="bs-wr-w">
                  {w.word_en.replace(/^\*/, "")}
                </b>
                {w.phonetic && <span className="bs-wr-ph">{w.phonetic}</span>}
                {w.pos && <span className="bs-wr-po">{w.pos}</span>}
                <span className="bs-wr-df">{w.definition_zh}</span>
                {w.entry_type !== "phrase" && (
                  <span
                    className="bs-wr-spk"
                    role="button"
                    tabIndex={0}
                    aria-label={`朗读 ${w.word_en}`}
                    onClick={() => speak(w.word_en)}
                    onKeyDown={(e) => e.key === "Enter" && speak(w.word_en)}
                  >
                    🔊
                  </span>
                )}
                <span
                  className="bs-wr-dot"
                  style={{
                    background: st && st.lv >= 6 ? "#2f7d4f" : st && st.lv > 0 ? "#c96f38" : "#ded6c2",
                  }}
                />
              </div>
              {w.affix_hint && <div className="bs-wr-af">{w.affix_hint}</div>}
            </div>
          );
        })}
      </div>

      <div className="bs-wlist-foot">
        <span>
          {grade} 年级{semester === 1 ? "上" : "下"}册 · Unit {unit}
          {dictMode && " · 默写卷"}
        </span>
        <span>第 {unit} 单元 · 词跃 LexiRise</span>
      </div>
    </div>
  );
}