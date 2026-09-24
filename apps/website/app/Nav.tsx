"use client";

import { useState } from "react";
import { Menu, X, Sparkles } from "lucide-react";

const LINKS = [
  { href: "#product", label: "AI 员工" },
  { href: "#service", label: "智能客服" },
  { href: "#bi", label: "经营分析" },
  { href: "#orders", label: "订单" },
  { href: "#inventory", label: "库存" },
  { href: "#mobile", label: "移动端" },
  { href: "#handoff", label: "人工接管" },
  { href: "#ecosystem", label: "生态" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a className="brand" href="#top" aria-label="WANLAN AI 首页">
          <span className="brand-mark">W</span>
          WANLAN AI
        </a>

        <nav className="nav-links" aria-label="主导航">
          {LINKS.map((l) => (
            <a key={l.href} className="nav-link" href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>

        <div className="nav-cta">
          <a className="btn btn-ghost" href="#mobile">
            下载 App
          </a>
          <a className="btn btn-primary" href="#cta">
            <Sparkles size={16} /> 免费试用
          </a>
          <button
            className="nav-toggle"
            aria-label={open ? "关闭菜单" : "打开菜单"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="nav-mobile open">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href="#cta" onClick={() => setOpen(false)}>
            免费试用
          </a>
        </div>
      ) : null}
    </header>
  );
}
