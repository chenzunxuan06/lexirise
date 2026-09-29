// scripts/verify-dom.mjs —— CDP 无头浏览器验证：加载 URL，输出可见文本 + JS 异常
// 用法: node scripts/verify-dom.mjs <url> [edgeProfDir]
const url = process.argv[2] || "http://127.0.0.1:3000/";
const port = 9222;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 1. 找一个已打开的页面（先由启动命令打开目标 URL）
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) {
  console.log("NO_PAGE");
  process.exit(1);
}

// 2. 连接 CDP
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const exceptions = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  } else if (m.method === "Runtime.exceptionThrown") {
    exceptions.push(m.params?.exceptionDetails?.exception?.description || "exception");
  } else if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") {
    exceptions.push("log:" + m.params.entry.text);
  }
};
function send(method, params = {}) {
  return new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Page.navigate", { url });
await sleep(3500);

const r = await send("Runtime.evaluate", {
  expression: "document.body ? document.body.innerText.slice(0, 600) : '(no body)'",
  returnByValue: true,
});
console.log("=== VISIBLE TEXT ===");
console.log(r?.result?.value ?? "(none)");
console.log("=== JS EXCEPTIONS ===");
console.log(exceptions.length ? exceptions.join("\n") : "(none)");
ws.close();
