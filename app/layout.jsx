import "./globals.css";
import "./bs.css";
import Sidebar from "./components/Sidebar";
import BottomTab from "./components/BottomTab";
import ShellHost from "./components/ShellHost";
import ThemeInit from "./components/ThemeInit";
import PwaSupport from "./components/PwaSupport";
import Onboarding from "./components/Onboarding";
import RewardToast from "./components/RewardToast";

export const metadata = {
  title: "词跃 LexiRise · 初中英语单词学习",
  description:
    "围绕单词的科学记忆网站：背书、训练、测验、词根词缀、记忆曲线、离线可用。数据与沪教牛津版初中英语课本同步。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "词跃 LexiRise",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-180.png",
  },
};

export const viewport = {
  themeColor: "#26221d",
  width: "device-width",
  initialScale: 1,
};

// ============================================================
// 本地救生脚本（SSR 直出，不经过 JS bundle）
//
// 为什么必须放在这里：
//   Service Worker 会把旧页面壳缓存在浏览器里。当服务没在跑时，SW 直接把旧壳端出来；
//   旧壳又去要一个已经 404 的 chunk → Loading chunk failed。而"能处理这个错误、
//   注销 SW 的新代码"本身就在 bundle 里 —— bundle 加载失败 = 永远跑不到 → 死锁。
//   页面里没有任何可见按钮能打破它（2026-09-22 用户卡在这里很久）。
//   把注销动作放进服务端直出的内联脚本，它会在任何 /_next/static chunk 之前执行：
//   只要你能拿到一次这份新 HTML，环就断了。
//
// 只对本地生效，线上域名原样保留 PWA 离线能力。
// ============================================================
const KILL_LOCAL_SW = `
(function(){
  try {
    var h = location.hostname;
    var local = (h === "localhost") || (h === "127.0.0.1") || (h === "::1") || (h === "[::1]") || /\\.local$/.test(h);
    if (!local) return;
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        for (var i = 0; i < rs.length; i++) { rs[i].unregister(); }
      }).catch(function () {});
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (ks) {
        for (var i = 0; i < ks.length; i++) { caches.delete(ks[i]); }
      }).catch(function () {});
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <script dangerouslySetInnerHTML={{ __html: KILL_LOCAL_SW }} />
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">
          <ShellHost>{children}</ShellHost>
        </main>
        </div>
        <div className="icp-bar">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
            粤ICP备2026124935号
          </a>
          <span className="icp-sep">·</span>
          <a
            href="https://beian.mps.gov.cn/#/query/webSearch?code=44010502004343"
            target="_blank"
            rel="noreferrer"
          >
            <img src="/icons/gongan.png" alt="公安备案" className="icp-icon" />
            粤公网安备44010502004343号
          </a>
        </div>
        <PwaSupport />
        <Onboarding />
        <RewardToast />
        <BottomTab />
        <ThemeInit />
      </body>
    </html>
  );
}
