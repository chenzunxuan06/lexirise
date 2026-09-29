// ============================================================
// lib/analytics.js —— 客户端打点（批量上报，轻量、无阻塞）
// ------------------------------------------------------------
// track("event", {meta}) 累计缓冲，满 10 条或 30 秒自动 POST /api/events
// 用于后台行为分析（DAU/功能分布），不阻塞主流程、失败静默。
// ============================================================

let buffer = [];
let timer = null;

function flush() {
  if (!buffer.length) return;
  const events = buffer.splice(0, buffer.length);
  try {
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    /* 静默失败 */
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flush();
  }, 30000);
}

export function track(event, meta = {}) {
  buffer.push({ event, meta });
  if (buffer.length >= 10) {
    clearTimeout(timer);
    timer = null;
    flush();
  } else {
    schedule();
  }
}

export default track;
