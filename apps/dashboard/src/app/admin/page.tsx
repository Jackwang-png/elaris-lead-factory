"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Building2, Users, Bot, UsersRound, MessageSquare, Mail, Target, BookOpen } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const accentMap = [
  { accent: "var(--accent)", soft: "var(--accent-soft)", Icon: Building2 },
  { accent: "var(--info)", soft: "var(--info-soft)", Icon: Users },
  { accent: "var(--success)", soft: "var(--success-soft)", Icon: Bot },
  { accent: "var(--warning)", soft: "var(--warning-soft)", Icon: UsersRound },
  { accent: "var(--accent)", soft: "var(--accent-soft)", Icon: MessageSquare },
  { accent: "var(--info)", soft: "var(--info-soft)", Icon: Mail },
  { accent: "var(--success)", soft: "var(--success-soft)", Icon: Target },
  { accent: "var(--warning)", soft: "var(--warning-soft)", Icon: BookOpen },
];

export default function AdminHome() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    axios.get(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setStats(res.data))
      .catch((err) => console.error(err));
  }, []);

  const items = stats ? [
    { label: "商家（租户）", value: stats.tenants },
    { label: "平台用户", value: stats.users },
    { label: "Bot 数量", value: stats.bots },
    { label: "客户总数", value: stats.customers },
    { label: "会话数", value: stats.conversations },
    { label: "消息数", value: stats.messages },
    { label: "线索数", value: stats.leads },
    { label: "知识条目", value: stats.knowledge },
  ] : [];

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Admin Console</div>
          <h1>平台总览</h1>
          <p className="page-subtitle">SmartCS 平台全量运行数据与关键指标</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }} className="admin-stats">
        {items.map((it, idx) => {
          const color = accentMap[idx % accentMap.length];
          const IconComp = color.Icon;
          return (
            <div key={it.label} className="stat-card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "22px 22px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: color.soft,
                    border: "1px solid var(--border-default)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: color.accent,
                  }}>
                    <IconComp size={18} strokeWidth={1.8} />
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 6, fontWeight: 500, letterSpacing: 0.1 }}>{it.label}</div>
                <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: -0.6, lineHeight: 1.15, fontVariantNumeric: "tabular-nums", color: color.accent }}>
                  {it.value ?? "—"}
                </div>
              </div>
              <div style={{
                height: 2,
                background: `linear-gradient(90deg, transparent 0%, ${color.accent} 100%)`,
                opacity: 0.35,
              }} />
            </div>
          );
        })}
      </div>

      {!stats && (
        <div className="empty-state">
          <div className="empty-icon"><BookOpen size={20} strokeWidth={1.6} color="var(--text-tertiary)" /></div>
          <div className="empty-title">加载中</div>
          <div className="empty-desc">正在获取平台统计数据</div>
        </div>
      )}

      <style>{`
        @media(max-width:1000px){
          .admin-stats{ grid-template-columns: repeat(3,1fr) !important; }
        }
        @media(max-width:720px){
          .admin-stats{ grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
    </div>
  );
}
