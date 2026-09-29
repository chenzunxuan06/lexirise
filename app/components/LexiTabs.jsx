"use client";

// ============================================================
// LexiTabs —— 词料库三段切换条（词库 / 短语 / 词根词缀）
// 挂在三个页面的 hero 下方，互相跳转；侧边栏只保留一个"词料库"入口
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/vocab", label: "词库" },
  { href: "/phrases", label: "短语" },
  { href: "/affixes", label: "词根词缀" },
  { href: "/confusable", label: "易混词" },
];

export default function LexiTabs() {
  const pathname = usePathname();
  return (
    <div className="lexi-tabs" role="tablist" aria-label="词料库切换">
      {ITEMS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={pathname.startsWith(t.href)}
          className={"lexi-tab" + (pathname.startsWith(t.href) ? " on" : "")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}