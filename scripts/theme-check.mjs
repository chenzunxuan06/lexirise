// 纸墨换肤验证：读取关键元素计算样式（浅色 + 深色两遍）
const CDP = "http://127.0.0.1:9222";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTarget() {
  const targets = await (await fetch(CDP + "/json")).json();
  return targets.find((t) => t.type === "page" && t.url.includes("localhost:3000"));
}
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pend.set(i, { res }); ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { ws, send };
}

async function probe(path, setDark, name) {
  const target = await getTarget();
  const { ws, send } = await connect(target);
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: "http://localhost:3000" + path });
  await sleep(4500);
  const mode = setDark ? "dark" : "light";
  const expr = `(() => {
    document.documentElement.setAttribute('data-theme', '${mode}');
    const cs = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const out = {};
    const get = (sel, props) => { const s = cs(sel); if (!s) { out[sel] = "MISSING"; return; } const o = {}; props.forEach(p => o[p] = s[p]); out[sel] = o; };
    get("body", ["backgroundColor", "backgroundImage", "color"]);
    get(".hm-hero", ["backgroundColor", "borderColor", "boxShadow", "color", "borderRadius"]);
    get(".start-btn", ["backgroundColor", "color", "borderColor", "borderRadius"]);
    get(".badge.err", ["backgroundColor", "borderColor", "color", "transform"]);
    get(".daily-entry", ["backgroundColor", "borderColor", "boxShadow"]);
    const de = document.querySelector(".daily-entry");
    out["daily-entry::before"] = de ? getComputedStyle(de, "::before").backgroundColor + " / " + getComputedStyle(de, "::before").content : "MISSING";
    get(".combo-toast", ["backgroundColor", "borderColor", "color"]);
    out.vw = window.innerWidth;
    return JSON.stringify(out);
  })()`;
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  console.log(`--- ${name} (${path}) ---`);
  console.log(res.result.value);
  ws.close();
}

await probe("/", false, "首页·浅色");
await probe("/", true, "首页·深色");
await probe("/review?tab=wrong", false, "复习错题·浅色");
await probe("/train", false, "训练·浅色");
process.exit(0);