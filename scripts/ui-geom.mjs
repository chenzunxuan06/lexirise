// 首页布局几何检测：通过 CDP 读取各区块 boundingClientRect，判断重叠
// 用法: node scripts/ui-geom.mjs [port] [urlFilter] [width] [height] [mobile]
const CDP = `http://127.0.0.1:${process.argv[2] || 9222}`;
const URLF = process.argv[3] || "localhost:3000";
const W = Number(process.argv[4]) || 390;
const H = Number(process.argv[5]) || 844;
const MOBILE = process.argv[6] === "mobile";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await (await fetch(CDP + "/json")).json();
  const page = targets.find((t) => t.type === "page" && t.url.includes(URLF));
  if (!page) {
    console.error("no matching page target");
    process.exit(1);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pend.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      if (m.error) pend.get(m.id).rej(new Error(m.error.message));
      else pend.get(m.id).res(m.result);
      pend.delete(m.id);
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await send("Runtime.enable");
  await send("Page.enable");
  // 设备模拟（手机视口 / 桌面视口）
  await send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: MOBILE,
  });
  await send("Page.reload", { ignoreCache: true });
  // 等客户端数据与渲染完成
  await sleep(4500);
  const expr = `(() => {
    const sel = [".app-shell", ".app-main", ".sidebar", ".hm-wrap", ".hm-hero", ".hm-goal", ".hm-chips", ".hm-xpbar", ".hm-gprog", ".hm-hero-top", ".hm-cta", ".hm-todo", ".hm-daily", ".hm-grid", ".footer"];
    const out = {};
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) { const r = el.getBoundingClientRect(); out[s] = { y: Math.round(r.y), h: Math.round(r.height), bottom: Math.round(r.bottom), x: Math.round(r.x), w: Math.round(r.width) }; }
      else out[s] = "MISSING";
    }
    const hero = document.querySelector(".hm-hero");
    const goal = document.querySelector(".hm-goal");
    let overlap = null;
    if (hero && goal) {
      const a = hero.getBoundingClientRect(), b = goal.getBoundingClientRect();
      overlap = {
        heroBottom: Math.round(a.bottom),
        goalTop: Math.round(b.top),
        gap: Math.round(b.top - a.bottom),
        overlapPx: Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
      };
    }
    const chips = document.querySelector(".hm-chips");
    const xpbar = document.querySelector(".hm-xpbar");
    let chipXp = null;
    if (chips && xpbar) {
      const a = chips.getBoundingClientRect(), b = xpbar.getBoundingClientRect();
      chipXp = { chipsBottom: Math.round(a.bottom), xpTop: Math.round(b.top), gap: Math.round(b.top - a.bottom) };
    }
    const top = document.querySelector(".hm-hero-top");
    let topChips = null;
    if (top && chips) {
      const a = top.getBoundingClientRect(), b = chips.getBoundingClientRect();
      topChips = { topBottom: Math.round(a.bottom), chipsTop: Math.round(b.top), gap: Math.round(b.top - a.bottom) };
    }
    return JSON.stringify({ rects: out, overlap, chipXp, topChips, vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio, scrolly: window.scrollY });
  })()`;
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  console.log(res.result.value);
  ws.close();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });