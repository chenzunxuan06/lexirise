"use client";

// ============================================================
// PetEmpty —— 空状态/加载态插画（跃跃陪伴）
// ============================================================

import PetImage from "./PetImage";

export default function PetEmpty({
  action = "book",
  title = "加载词库中…",
  sub = "跃跃在帮你翻书，稍等一下",
}) {
  return (
    <div className="pet-empty">
      <PetImage stage={1} action={action} size={64} className="pet-float" />
      <div className="pe-t">{title}</div>
      <div className="pe-s">{sub}</div>
    </div>
  );
}