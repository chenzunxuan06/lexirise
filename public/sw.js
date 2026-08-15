// sw.js —— Service Worker：离线缓存 + 数据安全
// 策略：
//  - 页面导航：网络优先，失败回退缓存（离线可打开页面）
//  - /_next/static/* 与图标/清单：缓存优先（秒开 + 离线）
//  - words.json / affixes.json：缓存优先（词库离线可用）
//  - /api/*：绝不缓存（用户数据隐私 + 时效性）
// 版本号：每次改动资源结构时 +1 使缓存刷新
const CACHE = "lexirise-v2";

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
  "/words.json",
  "/affixes.json",
  "/manifest.webmanifest",
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
  if (path.startsWith("/_next/static/") || path === "/words.json" || path === "/affixes.json") {
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
