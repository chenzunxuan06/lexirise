import "./globals.css";
import Sidebar from "./components/Sidebar";
import PwaSupport from "./components/PwaSupport";

export const metadata = {
  title: "词跃 LexiRise · 初中英语单词学习",
  description:
    "围绕单词的科学记忆网站：背书、训练、测验、词根词缀、记忆曲线、离线可用。数据为沪教牛津版初中英语 1535 词。",
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
  themeColor: "#1d9e75",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="app-shell">
          <Sidebar />
          <main className="app-main">{children}</main>
        </div>
        <div className="icp-bar">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
            粤ICP备2026124935号
          </a>
        </div>
        <PwaSupport />
      </body>
    </html>
  );
}
