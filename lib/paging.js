// lib/paging.js —— 分页工具（分页纪律：一次列举 >12 条必须分页）
// pageWindow：总页数多时窗口化页码（1 … cur-1 cur cur+1 … last），
// 避免十几个数字挤成一行、也避免用户看不出自己在第几页。

export function pageWindow(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, cur, cur - 1, cur + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  nums.forEach((n) => {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  });
  return out;
}

export function pagerInfo(cur, size, total, unit = "条") {
  if (!total) return `共 0 ${unit}`;
  const from = (cur - 1) * size + 1;
  const to = Math.min(cur * size, total);
  return `第 ${from}–${to} ${unit} · 共 ${total} ${unit}`;
}
