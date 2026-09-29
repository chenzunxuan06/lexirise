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
//  - words.json / affixes.json：缓存优先（词库离线可用）
//  - /api/*：绝不缓存（用户数据隐私 + 时效性）
// 版本号：每次改动资源结构时 +1 使缓存刷新
const CACHE = "lexirise-v7";

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
    "/words.json",
    "/affixes.json",
    "/manifest.webmanifest",
    "/tts-diag.html",
    "/icon.svg",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
  ];

  self.addEventListener("install", (e) => {
    e.waitUntil(
      caches
        .open(CACHE)
        .then((c) => c.addAll(PRECACHE))
        .then(() => self.skipWaiting())
        .catch(() => self.skipWaiting()) // 个别资源失败不阻塞安装
    );
  });

  self.addEventListener("activate", (e) => {
    e.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim())
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
          .catch(() => caches.match(req).then((m) => m || caches.match("/")))
      );
      return;
    }

    // 静态资源 + 词库数据：缓存优先（后台更新）
    if (
      path.startsWith("/_next/static/") ||
      path === "/words.json" ||
      path === "/affixes.json"
    ) {
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
