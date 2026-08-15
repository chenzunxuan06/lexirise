"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  return (
    <header className="topnav">
      <Link href="/" className="nav-brand">
        词跃 <span>LexiRise</span>
      </Link>
      <nav className="nav-links">
        <Link
          href="/"
          className={"nav-link" + (path === "/" ? " active" : "")}
        >
          词库
        </Link>
        <Link
          href="/train"
          className={"nav-link" + (path === "/train" ? " active" : "")}
        >
          训练
        </Link>
      </nav>
    </header>
  );
}
