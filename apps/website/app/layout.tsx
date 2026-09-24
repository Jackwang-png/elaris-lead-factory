import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.wan-wan.top"),
  title: {
    default: "WANLAN AI · 万澜 — 电商 AI 员工",
    template: "%s · WANLAN AI",
  },
  description:
    "WANLAN AI（万澜）为电商商家提供 AI 员工：自动客服、经营分析、订单与库存洞察、人工接管与移动协同。让 AI 真正进入电商经营。",
  keywords: ["WANLAN AI", "万澜", "电商 AI", "AI 员工", "智能客服", "经营分析", "订单管理", "库存预警"],
  authors: [{ name: "WANLAN AI" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "https://www.wan-wan.top",
    siteName: "WANLAN AI",
    title: "WANLAN AI · 万澜 — 电商 AI 员工",
    description: "自动客服、经营分析、订单与库存洞察、人工接管与移动协同。让 AI 真正进入电商经营。",
  },
  twitter: {
    card: "summary_large_image",
    title: "WANLAN AI · 万澜 — 电商 AI 员工",
    description: "自动客服、经营分析、订单与库存洞察、人工接管与移动协同。让 AI 真正进入电商经营。",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
