"use client";

// ============================================================
// PetImage —— 跃跃真图组件（透明 PNG 三形态 × 五动作）
// stage: 1幼狐 2少年狐 3词霸狐 ｜ action: idle|cheer|book|sleep|hungry
// 素材：/public/pet/s{stage}-{action}.png（由 prepare-pet.ps1 生成）
// ============================================================

const STAGE_KEY = { 1: "s1", 2: "s2", 3: "s3" };

export default function PetImage({
  stage = 1,
  action = "idle",
  size,
  round,
  className = "",
  alt = "跃跃",
  style,
}) {
  const key = STAGE_KEY[stage] || "s1";
  const src = `/pet/${key}-${action}.png`;
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className={
        "pet-img" +
        (round ? " pet-round" : "") +
        (className ? " " + className : "")
      }
      style={{ width: size, height: size, ...style }}
    />
  );
}