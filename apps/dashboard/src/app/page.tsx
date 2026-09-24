"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Bot, MessageSquare, Database, Users, Activity, CreditCard, Inbox, ChevronRight, Plus } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function Home() {
  const [bots, setBots] = useState<any[]>([]);
  const [conversations, setConversations] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    axios.get(`${API}/bots`, { headers }).then(r => setBots(r.data)).catch(() => {});
    axios.get(`${API}/conversations`, { headers }).then(r => setConversations(r.data)).catch(() => {});
    axios.get(`${API}/subscription/current`, { headers }).then(r => setSubscription(r.data)).catch(() => {});
    setTimeout(() => setLoading(false), 600);
  }, []);

  const stats = [
    {
      label: "助手数量",
      value: bots.length,
      hint: "全部在线运行",
      icon: <Bot size={18} strokeWidth={1.8} />,
      accent: "var(--accent)",
      accentSoft: "var(--accent-soft)",
    },
    {
      label: "今日对话",
      value: conversations.length,
      hint: "活跃会话",
      icon: <MessageSquare size={18} strokeWidth={1.8} />,
      accent: "var(--success)",
      accentSoft: "var(--success-soft)",
    },
    {
      label: "系统状态",
      value: "运行正常",
      hint: "99.9% 可用率",
      icon: <Activity size={18} strokeWidth={1.8} />,
      accent: "var(--success)",
      accentSoft: "var(--success-soft)",
    },
    {
      label: "当前套餐",
      value: subscription?.plan?.name || "FREE",
      hint: subscription?.plan?.name ? "已订阅" : "免费版",
      icon: <Database size={18} strokeWidth={1.8} />,
      accent: "var(--warning)",
      accentSoft: "var(--warning-soft)",
    },
  ];

  const quickLinks = [
    { t: "聊天测试", d: "和助手对话体验", href: "/chat", icon: <MessageSquare size={18} strokeWidth={1.8} />, accent: "var(--accent)" },
    { t: "知识库", d: "上传与管理知识文档", href: "/knowledge", icon: <Database size={18} strokeWidth={1.8} />, accent: "var(--info)" },
    { t: "客户管理", d: "查看客户画像列表", href: "/customers", icon: <Users size={18} strokeWidth={1.8} />, accent: "var(--success)" },
    { t: "订阅套餐", d: "升级或续费管理", href: "/subscription", icon: <CreditCard size={18} strokeWidth={1.8} />, accent: "var(--warning)" },
  ];

  return (
    <div className="fade-in-up" style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* 顶部标题区 */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">工作台</div>
          <h1>控制台</h1>
          <p className="page-subtitle">欢迎回来，这里是您的客服指挥中心</p>
        </div>
        <Link href="/bots" className="btn-primary">
          <Plus size={15} strokeWidth={2.2} />
          新建助手
        </Link>
      </div>

      {/* 统计卡片 */}
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="home-stats">
          {stats.map((s) => (
            <div key={s.label} className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "22px 22px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: s.accentSoft,
                    border: "1px solid var(--border-default)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: s.accent,
                  }}>
                    {s.icon}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>{s.hint}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 500, letterSpacing: 0.1 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: -0.6, lineHeight: 1.15, fontVariantNumeric: "tabular-nums", color: s.accent }}>
                  {loading ? "—" : s.value}
                </div>
              </div>
              <div style={{
                height: 2,
                background: `linear-gradient(90deg, transparent 0%, ${s.accent} 100%)`,
                opacity: 0.35,
              }} />
            </div>
          ))}
        </div>
      </section>

      {/* 快捷入口 */}
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div className="page-eyebrow">快速导航</div>
            <h2 style={{ fontSize: 17, fontWeight: 650, letterSpacing: -0.2, margin: 0, color: "var(--text-primary)" }}>常用功能</h2>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="home-quick">
          {quickLinks.map((q) => (
            <Link key={q.t} href={q.href} style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: 20, height: "100%", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12,
                    background: `${q.accent}1a`,
                    border: `1px solid ${q.accent}26`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: q.accent,
                  }}>
                    {q.icon}
                  </div>
                  <ChevronRight size={16} color="var(--text-muted)" />
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 650, color: "var(--text-primary)", marginBottom: 4, letterSpacing: -0.05 }}>{q.t}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", lineHeight: 1.5 }}>{q.d}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 双栏列表 */}
      <section style={{ marginBottom: 26 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="home-twocol">
          {/* 助手列表 */}
          <div className="card" style={{ padding: "22px 22px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: "var(--accent-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--accent)",
                }}>
                  <Bot size={15} strokeWidth={1.8} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 650, margin: 0, color: "var(--text-primary)", letterSpacing: -0.1 }}>我的助手</h2>
              </div>
              <Link href="/bots" style={{ fontSize: 12.5, color: "var(--text-tertiary)", textDecoration: "none", transition: "color var(--transition-fast)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                查看全部 <ChevronRight size={13} />
              </Link>
            </div>
            <div style={{ marginTop: 8, padding: "8px 0 4px" }}>
              {bots.length === 0 ? (
                <EmptyState text="还没有助手" hint="点击右上角创建您的第一个助手" />
              ) : (
                bots.slice(0, 4).map((bot) => (
                  <div key={bot.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border-subtle)", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{bot.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3, lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {bot.description || "暂无描述"}
                      </div>
                    </div>
                    <span className="badge badge-success">{bot.model || "在线"}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 最近对话 */}
          <div className="card" style={{ padding: "22px 22px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: "var(--info-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--info)",
                }}>
                  <MessageSquare size={15} strokeWidth={1.8} />
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 650, margin: 0, color: "var(--text-primary)", letterSpacing: -0.1 }}>最近对话</h2>
              </div>
              <Link href="/chat" style={{ fontSize: 12.5, color: "var(--text-tertiary)", textDecoration: "none", transition: "color var(--transition-fast)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                打开聊天 <ChevronRight size={13} />
              </Link>
            </div>
            <div style={{ marginTop: 8, padding: "8px 0 4px" }}>
              {conversations.length === 0 ? (
                <EmptyState text="还没有对话" hint="开始一段对话吧，客户正在赶来" />
              ) : (
                conversations.slice(0, 4).map((c: any) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border-subtle)", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{c.bot?.name || "对话会话"}</div>
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {c.messages?.[c.messages.length - 1]?.content || "暂无消息内容"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <style>{`
        @media(max-width:1000px){
          .home-stats{ grid-template-columns: repeat(2,1fr) !important; }
          .home-quick{ grid-template-columns: repeat(2,1fr) !important; }
          .home-twocol{ grid-template-columns: 1fr !important; }
        }
        @media(max-width:640px){
          .home-stats{ grid-template-columns: 1fr 1fr !important; }
          .home-quick{ grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ---------- 空状态 ---------- */
function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ padding: "22px 0 26px", textAlign: "center" }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12, margin: "0 auto 10px",
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed var(--border-default)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-tertiary)",
      }}>
        <Inbox size={17} strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 500 }}>{text}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
