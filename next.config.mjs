/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 服务端模式：API 路由（注册/登录/同步）需要 Node 运行时
  // 部署: 宝塔/CloudStudio 用 npm run build + npm run start（PM2 守护）
  // Vercel 兼容：构建无需改动（SQLite 文件写服务端磁盘，Vercel 无持久磁盘需后续换托管库）

  // ============================================================
  // 缓存头（2026-09-22 加）—— 解决"改了代码但用户一直看到旧页面"
  //
  // 背景：Next 给预渲染页的默认 HTML 头是
  //   `Cache-Control: s-maxage=31536000, stale-while-revalidate`（没有 max-age）
  // 浏览器会回源所以本地看起来没事；但站前一旦有 CDN / nginx proxy_cache，
  // 就会把旧页面壳发一年 → 旧壳去要已 404 的 chunk → 全站 Loading chunk failed。
  //
  // 同时给 /sw.js 加 no-store：这是 Service Worker 自毁补丁能送达的前提 ——
  // 若 sw.js 被长缓存，浏览器永远发现不了新版本，旧的 SW 就永远活着。
  // ============================================================
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
      {
        // 页面壳（HTML）：不缓存。排除静态资源与数据文件，别动 _next 的 immutable。
        source:
          "/:path((?!_next|audio|icons|pet|favicon|manifest|sw\\.js|words\\.json|affixes\\.json|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|ico|mp3|webmanifest|txt|xml)).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
