"use client";

// ============================================================
// app/components/rows.jsx —— 方向C「六种行」排版规范唯一落地处
// ------------------------------------------------------------
// 六种行：MRow 目录行 / ARow 动作行 / WRow 词行 / SRow 设置行
//         / RRow 结果行 / StBar 状态行
// 放大预览（v8 §2.7）：选择/进入型行（MRow/ARow）按下不立即跳转，
//   而是放大 + 其余退淡，再点（或点「进 入」）才进入；点空白/Esc 收回。
// 约束：同一时刻最多一个放大行；页眉/快路径条/状态行不参与放大；
//   答题选项不放大（不在这里实现）。
// 只依赖 CSS 类 .bs-*（globals.css 末尾 append 的换肤层）。
// ============================================================

import { useEffect, useRef } from "react";

/* react 里实现"纯 CSS 悬停放大 + 焦点放大"，避免 js 状态管理竞争 */

/**
 * 目录行：圆点 + 粗体标题 + 点线 + 右侧 meta + ›
 * props: dot(color) title meta onClick active(当前行) muted right
 */
export function MRow({ dot, title, meta, onClick, active, right, hint }) {
  return (
    <div
      className={"bs-row bs-mrow" + (active ? " on" : "")}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick && onClick(e);
        }
      }}
    >
      <span className="bs-dot" style={dot ? { background: dot } : undefined} />
      <b className="bs-row-t">{title}</b>
      <span className="bs-dots" />
      {meta != null && <span className="bs-meta">{meta}</span>}
      {right != null ? (
        right
      ) : (
        <span className="bs-go" aria-hidden="true">
          ›
        </span>
      )}
      {hint && <span className="bs-preview">{hint}</span>}
    </div>
  );
}

/**
 * 动作行：小图标(可选) + 标题/说明 + 耗时 + ›
 */
export function ARow({ icon, title, desc, time, onClick, disabled }) {
  return (
    <div
      className={"bs-row bs-arow" + (disabled ? " dim" : "")}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick && onClick(e);
        }
      }}
    >
      {icon != null && <span className="bs-ic">{icon}</span>}
      <span className="bs-tx">
        <b>{title}</b>
        {desc && <span>{desc}</span>}
      </span>
      {time != null && <span className="bs-time">{time}</span>}
      <span className="bs-go" aria-hidden="true">
        ›
      </span>
    </div>
  );
}

/**
 * 词行：序号 + 词 + 音标 + 词性 + 释义（右对齐）+ 状态点
 * props: no word phonetic pos def dot onClick star
 */
export function WRow({ no, word, phonetic, pos, def, dot, onClick, muted }) {
  return (
    <div
      className={"bs-row bs-wrow" + (muted ? " dimtxt" : "")}
      role="button"
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      {no != null && <span className="bs-no">{no}</span>}
      <b className="bs-word">{word}</b>
      {phonetic && <span className="bs-phon">{phonetic}</span>}
      {pos && <span className="bs-pos">{pos}</span>}
      <span className="bs-def">{def}</span>
      {dot && <span className="bs-dot" style={dot.color ? { background: dot.color } : undefined} />}
    </div>
  );
}

/** 设置行：键名 + 右对齐当前值 */
export function SRow({ k, v, mute, onClick }) {
  return (
    <div
      className={"bs-row bs-srow" + (onClick ? " clickable" : "")}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      <span className="bs-k">{k}</span>
      <span className={"bs-v" + (mute ? " mute" : "")}>{v}</span>
    </div>
  );
}

/**
 * 结果行：✓/✗(或文字) + 词 + 说明 + 右侧标签
 * prop: mark 属性传「对/错/未作答」文字或 JSX
 */
export function RRow({ word, mark, markCls, def, tag }) {
  return (
    <div className="bs-row bs-rrow">
      <span className={"bs-mk " + (markCls || "")}>{mark}</span>
      <span className="bs-word">{word}</span>
      {def && <span className="bs-rrdef">{def}</span>}
      {tag && <span className="bs-tag">{tag}</span>}
    </div>
  );
}

/**
 * 状态行（墨底条）：深色 = 现在该干的事；guide 虚线引导；fin 完成态印章绿
 * props: variant normal|guide|fin icon title desc go onGo
 */
export function StBar({ variant = "normal", icon, title, desc, go, onGo }) {
  return (
    <div className={"bs-stbar" + (variant !== "normal" ? " " + variant : "")}>
      {icon && <span className="bs-ic">{icon}</span>}
      <span className="bs-stx">
        <b>{title}</b>
        {desc && <span>{desc}</span>}
      </span>
      {go && (
        <button className="bs-go" onClick={onGo}>
          {go}
        </button>
      )}
    </div>
  );
}

/** 放大预览容器：包一组 MRow/ARow。内部实现"一行放大、其余退淡"（纯 CSS hover/focus-within） */
export function ZoomList({ children, className = "" }) {
  const ref = useRef(null);

  // Esc 取消放大（焦点回退）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        const z = el.querySelector(".bs-zoomrow");
        z && z.blur();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={ref} className={"bs-zoomlist" + (className ? " " + className : "")}>
      {children}
    </div>
  );
}

export default { MRow, ARow, WRow, SRow, RRow, StBar, ZoomList };