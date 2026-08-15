/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 服务端模式：API 路由（注册/登录/同步）需要 Node 运行时
  // 部署: 宝塔/CloudStudio 用 npm run build + npm run start（PM2 守护）
  // Vercel 兼容：构建无需改动（SQLite 文件写服务端磁盘，Vercel 无持久磁盘需后续换托管库）
};

export default nextConfig;
