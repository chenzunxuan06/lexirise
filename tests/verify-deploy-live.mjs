// ============================================================
// tests/verify-deploy-live.mjs —— 线上到底部署上去了没有
// ------------------------------------------------------------
// 为什么要有这个：本机铁律 §11 ——
//   「说『正常』前必须验证 UI 层；HTTP 200 只是半句话。」
// 部署最危险的失败模式是"看着成功、其实没生效"：
//   * 覆盖到了旧目录、nginx 还指着 out/、构建产物没被 pm2 用上……
//   首页返回 200 完全不能说明任何问题。
//
// 所以这里挨个查"新版才有的东西"。部署前跑一遍会看到一片 FAIL —— 那是对的，
// 那正是基线。部署后再跑，应该全绿。
//
// 用法:  node tests/verify-deploy-live.mjs
//         node tests/verify-deploy-live.mjs https://别的地址
// ============================================================
const BASE = process.argv[2] || 'https://www.chenzx.asia';

// ---- 先探一次 TLS ----
// ⚠️ 线上证书链不完整：服务器只发了叶证书，没发中间证书。
//    浏览器会自己去补链（AIA），所以看不出问题；
//    但 **Node 的 undici、curl、部分老安卓、微信内置浏览器都不会补** ——
//    对一群用各种手机的学生来说，这就是「打不开」。**这是服务器端的真实缺陷。**
//
//    所以这里先严格试一次；只有确实是因为缺链才降级，并**大声警告**。
//    证书链修好之后，那段警告会自动消失 —— 它同时也是一个探针。
try {
  await fetch(BASE + '/');
} catch (e) {
  const code = e && e.cause && e.cause.code;
  if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.log('⚠️  线上证书链不完整（缺中间证书），本次验收已降级跳过 TLS 校验。');
    console.log('    这不是脚本的问题，是服务器要修的东西 —— 见部署操作单。');
    console.log('');
  }
}

let fail = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  -> ' + extra : ''));
  if (!ok) fail++;
};

async function get(path) {
  try {
    const r = await fetch(BASE + path, { redirect: 'follow' });
    const text = await r.text();
    return { status: r.status, text };
  } catch (e) {
    return { status: 0, text: '', err: String(e && e.message) };
  }
}

console.log('线上地址: ' + BASE);
console.log('');

// ---- 1. 活页本外壳（10/04 之后的版本才有）----
const home = await get('/');
check('首页可达', home.status === 200, 'HTTP ' + home.status);
// ⚠️ 不要在这里查「活页本」—— 它是**客户端渲染**的：
//    ShellHost 首帧故意不渲染书壳（防水合闪动），所以 SSR 的 HTML 里没这三个字。
//    HTTP 层面查不到它，只能开浏览器 —— 见 tests/verify-deploy-live-ui.mjs。
//    （第一版就是在这里查的，报了个假 FAIL。今天第四次是断言自己写错了。）
check('首页有「词料库」入口（新版导航）', home.text.indexOf('词料库') >= 0);

// ---- 2. 这些静态文件是新版才有的 ----
const forms = await get('/forms.json');
check('/forms.json 存在（T20 题库）', forms.status === 200, 'HTTP ' + forms.status);
let itemCount = 0;
try { itemCount = (JSON.parse(forms.text).items || []).length; } catch (e) {}
// ⚠️ 原来断言的是 itemCount > 0，标签却写着"应为 249 道" ——
//    这种"标签说一套、代码查另一套"的检查会在题库被清空到只剩 1 道时照样放行。
//    改成有下界的实数断言。2026-10-06 语料清洗后重建为 247 道（原 249，去掉了 2 道坏句）。
check('/forms.json 题量正常（>=200 道）', itemCount >= 200, itemCount + ' 道');

const cloze = await get('/cloze.json');
check('/cloze.json 存在（T21 课文挖空，2026-10-06 新增）', cloze.status === 200, 'HTTP ' + cloze.status);
let clozeCount = 0;
try { clozeCount = (JSON.parse(cloze.text).items || []).length; } catch (e) {}
check('/cloze.json 题量正常（>=200 道）', clozeCount >= 200, clozeCount + ' 道');

const corpus = await get('/corpus/7A.json');
check('/corpus/7A.json 存在（课文语料索引）', corpus.status === 200, 'HTTP ' + corpus.status);

const morph = await get('/morphology.json');
check('/morphology.json 存在（词形归并）', morph.status === 200, 'HTTP ' + morph.status);

// ---- 3. 新版才有的页面 ----
const plan = await get('/plan');
check('/plan 可达（备考计划 / 10-04 那批）', plan.status === 200, 'HTTP ' + plan.status);

const fp = await get('/forms');
check('/forms 可达（适当形式填空）', fp.status === 200, 'HTTP ' + fp.status);

// ---- 4. 最要紧的一条：答题日志的接口在不在 ----
// 这是整条证据链的入口。它 404 的话，无论界面多好看，
// r_pred / elapsed / rating 一个字节都存不下来。
let evOk = false;
let evDetail = '';
try {
  const r = await fetch(BASE + '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [] }),
  });
  const t = await r.text();
  evOk = r.status === 200 && t.indexOf('"ok"') >= 0;
  evDetail = 'HTTP ' + r.status + ' ' + t.slice(0, 40);
} catch (e) {
  evDetail = String(e && e.message);
}
check('/api/events 存在（答题日志的入口）', evOk, evDetail);
console.log('');
console.log('  说明：这一条最关键。它不通的话，界面再新也只是"看起来做完了"——');
console.log('        反应时、自评原值、校准数据一个字节都存不下来。');

console.log('');
if (fail === 0) {
  console.log('线上已是新版，全部通过。');
} else {
  console.log(fail + ' 项未通过 —— 线上还是旧版（部署前跑出这个结果是对的）。');
}
process.exit(fail === 0 ? 0 : 1);
