// sw.js —— Service Worker：离线缓存 + 数据安全
//
// ⚠️ 2026-09-22 重要修正：本地（localhost / 127.0.0.1）自毁。
//   起因：`npm run start` 的 NODE_ENV 就是 production，所以本地也装了 SW，
//   它把页面壳缓存在浏览器里。服务一停，SW 就把旧壳端出来；旧壳又要已经 404 的 chunk
//   → Loading chunk failed。而"能注销 SW 的新代码"本身就在那个加载失败的 chunk 里
//   → 永远跑不到，怎么刷新都是旧页面（用户卡了很久的死锁）。
//   前端加判断**救不了已装的旧 SW** —— 浏览器只会在「更新检查」时重新拉这个文件，
//   所以自毁逻辑必须写在这里，并且这个文件本身不能被长缓存（见 next.config.mjs）。
//
// 策略（仅线上生效）：
//  - 页面导航：网络优先，失败回退缓存（离线可打开页面）
//  - /_next/static/* 与图标/清单：缓存优先（秒开 + 离线）
//  - 词库与语料数据（words/affixes/forms/cloze/corpus/morphology/sim-report）：
//    缓存优先 —— 离线也能出题、也能显示课文原句
//  - /api/*：绝不缓存（用户数据隐私 + 时效性）
// 版本号：每次改动资源结构时 +1 使缓存刷新
//
// ⚠️ 2026-10-07 补了三个洞（都是为了 10/11 的断网演练与答辩兜底）：
//   ① 新页面没进预缓存：/forms、/cloze、/plan、/compare、/evidence 都不在 PRECACHE 里，
//      而导航回退是 `caches.match(req) || caches.match("/")` ——
//      **断网点「课文挖空」会看到首页**，现场会很难看。
//   ② 新数据文件根本没被缓存：forms.json / cloze.json / corpus/*.json /
//      morphology.json 既不在预缓存、也不在 fetch 的缓存优先名单里，
//      所以离线时题库出不来、词详情页的"课本原句"整块消失。
//   ③ 带查询串的导航匹配不上：预缓存的是 /cloze，而实际地址是
//      /cloze?grade=8&semester=1&unit=3 —— 完整 URL 不同，缓存必然 miss。
//      现在导航回退会**先按路径名（忽略查询串）找一次**。
//   另外把预缓存从"要么全成、要么全废"的 addAll 换成逐个添加 ——
//   一个资源 404 不该让整份预缓存作废。
const CACHE = "lexirise-v8";

/** 本地环境判定：本地一律不工作，并把历史缓存清干净 */
const IS_LOCAL = (function () {
  try {
    const h = self.location.hostname;
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "::1" ||
      h === "[::1]" ||
      /\.local$/.test(h)
    );
  } catch (e) {
    return false;
  }
})();

if (IS_LOCAL) {
  // ---------- 本地：自毁 ----------
  // 装一个空版本，接管后清光所有缓存、注销自己、并让所有页面重新加载
  self.addEventListener("install", () => {
    self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch (e) {}
        try {
          await self.registration.unregister();
        } catch (e) {}
        try {
          const clients = await self.clients.matchAll({ type: "window" });
          clients.forEach((c) => {
            try { c.navigate(c.url); } catch (e) {}
          });
        } catch (e) {}
      })()
    );
  });
} else {
  // ---------- 线上：离线缓存 ----------

  // 首次安装预缓存：页面壳 + 词库数据（保证离线可用）
  const PRECACHE = [
    "/",
    "/login",
    "/recite",
    "/train",
    "/exam",
    "/review",
    "/vocab",
    "/phrases",
    "/mywords",
    "/affixes",
    "/stats",
    "/admin",
    "/ai",
    "/practice",
    "/unit",
    "/unit/words",
    // 2026-10-07 补：课文考点层与配套页（断网演练要用）
    "/forms",
    "/cloze",
    "/plan",
    "/compare",
    "/evidence",
    "/confusable",
    "/achievements",
    "/settings",
    "/words.json",
    "/affixes.json",
    "/manifest.webmanifest",
    "/tts-diag.html",
    "/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
  ];

  /**
   * 需要"缓存优先"的数据文件（离线可用）。
   * 语料按册分文件（/corpus/7A.json 等），所以用前缀判断而不是精确匹配。
   * ⚠️ 这些**不进预缓存**：六册语料 gzip 后也有几百 KB，
   *    装 SW 时全量拉一遍会跟首屏抢带宽。改成"访问过就缓存" ——
   *    断网演练前本来就要在线点一遍，顺序天然满足。
   */
  function isCacheFirstData(path) {
    return (
      path === "/words.json" ||
      path === "/affixes.json" ||
      path === "/forms.json" ||
      path === "/cloze.json" ||
      path === "/morphology.json" ||
      path === "/sim-report.json" ||
      path.startsWith("/corpus/")
    );
  }

  self.addEventListener("install", (e) => {
    e.waitUntil(
      caches
        .open(CACHE)
        // ⚠️ 逐个添加，而不是 addAll：addAll 是"要么全成、要么全废"，
        //    任何一个资源 404 都会让整份预缓存作废（而 catch 把错误吞了，
        //    表现就是"SW 装上了但什么都没缓存"，离线全白）。
        .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
        .then(() => self.skipWaiting())
        .catch(() => self.skipWaiting())
    );
  });

  /**
   * 激活后主动预热这几个小数据文件（合计 gzip 约 200 KB）。
   *
   * 为什么需要：**首次访问的文档不受 SW 控制** —— 浏览器要等 SW 激活、
   * 下一次导航才把页面交给它。所以"第一次打开就断网"时，
   * words.json / forms.json / cloze.json 这些还没进缓存，离线就是空的。
   * 实测（_sw_probe.mjs）：第一轮访问 4 个页面，cache 里只有预缓存；
   * 第二轮才出现 cloze.json。而"打开看一眼、然后断网演示"是最常见的用法。
   *
   * 为什么只热这几个：六册语料（/corpus/*.json）加起来 1 MB 以上，
   * 每次 SW 版本更新都拉一遍对手机流量不友好 —— 那部分保持"访问过才缓存"。
   * 放在 activate 之后（而不是 install 的预缓存里），是为了不跟首屏抢带宽。
   */
  const WARM = ["/words.json", "/affixes.json", "/forms.json", "/cloze.json", "/morphology.json"];

  self.addEventListener("activate", (e) => {
    e.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
        try {
          const c = await caches.open(CACHE);
          await Promise.allSettled(WARM.map((u) => c.add(u)));
        } catch (err) {
          /* 预热失败不影响任何功能：真访问时照样会走网络 */
        }
      })()
    );
  });

  self.addEventListener("fetch", (e) => {
    const req = e.request;
    if (req.method !== "GET") return; // POST/PUT 等（登录/同步）不拦截

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // 跨域不处理

    const path = url.pathname;

    // API 一律网络直连，绝不进缓存
    if (path.startsWith("/api/")) return;

    // 导航请求（页面）：网络优先 -> 缓存回退
    if (req.mode === "navigate") {
      e.respondWith(
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() =>
            caches
              .match(req)
              // ⚠️ 完整 URL 匹配不上时，**按路径名再找一次**（忽略查询串）：
              //    预缓存的是 /cloze，而学生点进来的是
              //    /cloze?grade=8&semester=1&unit=3 —— 不忽略查询串就会掉回首页。
              .then((m) => m || caches.match(url.origin + url.pathname))
              .then((m) => m || caches.match("/"))
          )
      );
      return;
    }

    // 静态资源 + 词库/语料数据：缓存优先（后台更新）
    if (path.startsWith("/_next/static/") || isCacheFirstData(path)) {
      e.respondWith(
        caches.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy));
              }
              return res;
            })
            .catch(() => hit);
          return hit || net;
        })
      );
      return;
    }

    // 发音音频 /audio/t/*.mp3：缓存优先（首播后离线也能发音）
    if (path.startsWith("/audio/t/")) {
      e.respondWith(
        caches.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy));
              }
              return res;
            })
            .catch(() => hit);
          return hit || net;
        })
      );
      return;
    }
  });
}
