// ============================================================
// lib/analytics.js —— 客户端打点（批量上报，轻量、无阻塞）
// ------------------------------------------------------------
// track("event", {meta}) 累计缓冲，满 10 条或 30 秒自动 POST /api/events
// 用于后台行为分析（DAU/功能分布），不阻塞主流程、失败静默。
//
// 【2026-10-04 修复】原实现只在"满 10 条"或"30 秒到"时上报，
// 没有页面卸载时的收尾上报 —— 答了 5 题就关页面，这 5 条会永久丢失。
// 现在补上 pagehide / visibilitychange 两个收尾时机。
// （fetch 本来就带 keepalive，所以只差触发时机，上报逻辑没动。）
// ============================================================

let buffer = [];
let timer = null;

function clearTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** 立刻上报缓冲区（不足 10 条也发）。页面隐藏 / 卸载时也走这里。 */
export function flushNow() {
  clearTimer();
  if (!buffer.length) return;
  const events = buffer.splice(0, buffer.length);
  try {
    // 注意：fetch 的网络失败是【异步 reject】，外层 try/catch 抓不到，
    // 必须挂 .catch —— 否则离线时会抛 unhandledRejection（"静默失败"名不副实）。
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {
      /* 离线 / 断网：静默丢弃 */
    });
  } catch {
    /* 同步异常（如 fetch 不存在）：静默 */
  }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushNow();
  }, 30000);
  // 浏览器里 setTimeout 返回数字（没有 unref），Node 里返回 Timeout 对象。
  // 加上 unref 后，待上报的定时器不会拖住 Node 进程退出 —— 测试因此不会空转 30 秒。
  timer.unref?.();
}

export function track(event, meta = {}) {
  buffer.push({ event, meta });
  if (buffer.length >= 10) {
    flushNow();
  } else {
    schedule();
  }
}

// 收尾时机：浏览器在这两个事件里仍允许带 keepalive 的 fetch
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}

export default track;
