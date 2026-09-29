// 404 兜底页（纸墨风）——未知地址 & 分享链接失效共用
import Link from "next/link";
import PetImage from "./components/PetImage";

export default function NotFound() {
  return (
    <div className="err-page">
      <div className="err-card">
        <div className="err-num">404</div>
        <div className="err-pet">
          <PetImage stage={1} action="hungry" size={96} />
        </div>
        <div className="err-big">这一页掉进书缝里了</div>
        <div className="err-sub">
          地址可能被撕掉了，或者你打开的分享链接已经失效。
          <br />
          回主页重新找找吧。
        </div>
        <div className="err-actions">
          <Link className="err-btn" href="/">回主页</Link>
        </div>
      </div>
    </div>
  );
}