"use client";

// ============================================================
// ChapterHead —— 章首头部（杂志化）
// variant: "mag"（双栏内页：左竖章号 + 右内容）｜"book"（居中书卷）
// 用法示例：
//   <ChapterHead
//     variant="mag"
//     ribbon={<>词跃 · REVIEW <b>第 09 期</b></>}
//     ribbonRight="已学 214 词"
//     chNo="03"
//     chLabel={["CHAPTER", "REVIEW", "UNIT 3"]}
//     title={<>到期 <span className="ch-hl">8 词</span>，到时间见它们了</>}
//     sub="错题 3 · 生词 5 · 预计 10 分钟"
//     quote="记忆曲线把这些词排到今天——别迟到。"
//   />
// ============================================================

export default function ChapterHead({
  variant = "mag",
  ribbon,
  ribbonRight,
  chNo,
  chLabel = [],
  title,
  sub,
  quote,
}) {
  if (variant === "book") {
    return (
      <div className="ch ch-book">
        <div className="ch-ribbon">
          <span>{ribbon}</span>
        </div>
        {chLabel && <div className="ch-ro">{chLabel}</div>}
        {title && <div className="ch-big">{title}</div>}
        {sub && <div className="ch-sub">{sub}</div>}
        {quote && <div className="ch-quote">{quote}</div>}
      </div>
    );
  }
  return (
    <div className="ch ch-mag">
      <div className="ch-ribbon">
        <span>{ribbon}</span>
        {ribbonRight && <span style={{ marginLeft: "auto" }}>{ribbonRight}</span>}
      </div>
      <div className="ch-row">
        <div className="ch-side">
          <b>{chNo}</b>
          {chLabel.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <div className="ch-main">
          {title && <div className="ch-big">{title}</div>}
          {sub && <div className="ch-sub">{sub}</div>}
          {quote && <div className="ch-quote">{quote}</div>}
        </div>
      </div>
    </div>
  );
}