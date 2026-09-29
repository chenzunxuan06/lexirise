// 全站逐页巡检：捕获运行时异常/console 错误/横向溢出/关键渲染标志
const CDP = "http://127.0.0.1:9222";
const PAGES = [
  "/", "/train", "/review", "/recite", "/exam", "/achievements",
  "/vocab", "/phrases", "/affixes", "/ai", "/stats", "/settings", "/login",
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const targets = await (await fetch(CDP + "/json")).json();
  const page = targets.find((t) => t.type === "page" && t.url.includes("localhost:3000"));
  if (!page) { console.error("no target"); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let errors = []; let head = {};
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id).res(m.result); pend.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      head = d; errors.push("EXC: " + (d.exception?.description || d.text).slice(0, 220));
    }
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      errors.push("ERR: " + m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 200));
    }
  };
  await new Promise((r) => { ws.onopen = r; });
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pend.set(i, { res }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await send("Runtime.enable");

  async function auditPage(path, w, h, mobile) {
    errors = [];
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send("Page.navigate", { url: "http://localhost:3000" + path });
    await sleep(5000);
    const r = await send("Runtime.evaluate", {
      expression: `(()=>{
        const de=document.documentElement, body=document.body;
        return JSON.stringify({
          url: location.pathname,
          vw: window.innerWidth,
          appErr: body.innerText.includes("Application error"),
          bodyLen: body.innerText.length,
          head: body.innerText.replace(/\\s+/g," ").slice(0,60),
          overflowX: de.scrollWidth > de.clientWidth + 1,
          sw: de.scrollWidth, cw: de.clientWidth,
          gamebar: !!document.querySelector(".gamebar"),
          ch: !!document.querySelector(".ch"),
          cover: !!document.querySelector(".mag-cover"),
        });
      })()`, returnByValue: true,
    });
    let line;
    try { line = JSON.parse(r.result.value); } catch { line = { url: path, parseErr: true }; }
    const flag = [];
    if (line.appErr) flag.push("APP-ERROR");
    if (line.overflowX) flag.push(`OVERFLOW(${line.sw}>${line.cw})`);
    if (errors.length) flag.push("CONSOLE-" + errors.length);
    console.log(`[${mobile ? "M" : "D"}] ${path} len=${line.bodyLen}${flag.length ? " ⚠ " + flag.join(" ") : ""}`);
    if (errors.length) console.log("   " + errors.slice(0, 2).join("\n   "));
    if (line.appErr) console.log("   head: " + line.head);
  }

  console.log("== 桌面 1280 ==");
  for (const p of PAGES) await auditPage(p, 1280, 900, false);
  console.log("== 手机 390 ==");
  for (const p of PAGES) await auditPage(p, 390, 844, true);
  ws.close();
}
run().catch((e) => { console.error("FATAL", e.message); process.exit(1); });