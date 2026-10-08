// ============================================================
// lib/nav.js —— 顶部/底部导航的**唯一来源**
// ------------------------------------------------------------
// 为什么要有这个文件：
//   桌面书签条与手机底栏此前各写了一份，于是同一件事有两个名字 ——
//   桌面叫「今日 / 复习 / 词料库 / 成长 Lv.N」，手机叫「首页 / 训练 / 复习 / 成就 / 我的」。
//   两套名字对不上是"重复感"的老根因（见 方向D-账号与专注页-细化方案 §2.1）。
//   现在两份渲染都从这里取，改一处两边一起变。
//
// 为什么只有 4 项：
//   第 5 项在两个外壳里落点不同 —— 桌面是 ⚙（设置），手机是「我的」弹层。
//   等 /me 我的页落地（计划里的 M4）之后，两边都会变成「我的 → /me」，
//   到那时这一项也收进来。在那之前不写死一个用不上的常量。
//
// 逐项 match 是"高亮哪一项"的判据：/vocab 页内含 词库 / 短语 / 词根词缀 / 易混词 四段，
//   它们各有自己的历史路由，所以都要算在「词料库」头上。
// ============================================================

export const NAV_TABS = [
  { key: "today", href: "/", label: "今日", match: ["/"], exact: true },
  { key: "review", href: "/review", label: "复习", match: ["/review"] },
  { key: "vocab", href: "/vocab", label: "词料库", match: ["/vocab", "/phrases", "/affixes", "/confusable"] },
  { key: "growth", href: "/achievements", label: "成长", match: ["/achievements", "/stats"] },
];

/**
 * 这一项在当前路径下该不该高亮。
 * @param {{href:string, match:string[], exact?:boolean}} tab
 * @param {string} pathname
 */
export function navTabActive(tab, pathname) {
  if (!pathname) return false;
  const p = pathname.split("?")[0];
  if (tab.exact) return tab.match.some((m) => p === m);
  return tab.match.some((m) => p === m || p.startsWith(m + "/"));
}

export default { NAV_TABS, navTabActive };
