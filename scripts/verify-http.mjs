// scripts/verify-http.mjs —— v8 边界验证：HTTP 状态码 + 页面 HTML 标记
// 用法: node scripts/verify-http.mjs <valid-share-token>
// 期望: / 200 ｜ 未知路径 404 err-card ｜ /__err-test 500 err-card ｜ 坏 token 404 ｜ 好 token 200
const base = "http://127.0.0.1:3000";
const goodToken = process.argv[2] || "";

const cases = [
  { name: "首页", url: "/", status: 200, mark: null },
  { name: "未知路径 404", url: "/no-such-page-xyz", status: 404, mark: "err-card" },
  { name: "错误边界 500", url: "/__err-test", status: 500, mark: "err-card" },
  { name: "分享-坏token", url: "/share/definitely-not-a-token", status: 404, mark: "err-card" },
];
if (goodToken) {
  cases.push({ name: "分享-好token", url: `/share/${goodToken}`, status: 200, mark: "share-cards" });
}

let fail = 0;
for (const c of cases) {
  try {
    const r = await fetch(base + c.url, { redirect: "manual" });
    const html = await r.text();
    const markOk = c.mark ? html.includes(c.mark) : true;
    const ok = r.status === c.status && markOk;
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: status=${r.status}(期望${c.status}) mark=${c.mark ? (markOk ? "有" : "缺") : "-"} len=${html.length}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${c.name}: ${e.message}`);
  }
}
process.exit(fail ? 1 : 0);
