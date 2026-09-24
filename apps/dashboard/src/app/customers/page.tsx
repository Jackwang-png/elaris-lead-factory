"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { Users } from "lucide-react";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

function getInitials(name: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const chars = Array.from(trimmed);
  if (chars.length <= 2) return chars.join("").toUpperCase();
  return chars[0].toUpperCase();
}

const gradients = [
  "linear-gradient(135deg, rgba(59,130,246,0.22), rgba(96,165,250,0.14))",
  "linear-gradient(135deg, rgba(96,165,250,0.22), rgba(59,130,246,0.14))",
  "linear-gradient(135deg, rgba(52,211,153,0.22), rgba(16,185,129,0.14))",
  "linear-gradient(135deg, rgba(244,114,182,0.22), rgba(236,72,153,0.14))",
  "linear-gradient(135deg, rgba(167,139,250,0.22), rgba(139,92,246,0.14))",
  "linear-gradient(135deg, rgba(251,191,36,0.22), rgba(245,158,11,0.14))",
];

function pickGradient(str: string): string {
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    axios.get(`${API}/customers`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } })
      .then(r => setCustomers(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tagClasses = ["badge-success", "badge-info", "badge-warning", "badge-neutral"];

  return (
    <div className="fade-in-up">
      <style>{`
        .avatar-box {
          width: 42px; height: 42px; border-radius: var(--radius-lg);
          display: grid; place-items: center;
          font-weight: 700; font-size: 15px; letter-spacing: -0.02em;
          flex-shrink: 0; border: 1px solid var(--border-subtle);
        }
      `}</style>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">Audience</div>
          <h1>客户管理</h1>
          <p className="page-subtitle">您服务的客户列表，查看客户资料与服务记录</p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="empty-icon"><Users size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
          <div className="empty-title">加载中</div>
          <div className="empty-desc">正在获取客户列表</div>
        </div>
      ) : customers.length === 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="empty-state">
            <div className="empty-icon"><Users size={22} strokeWidth={1.7} color="var(--accent)" /></div>
            <div className="empty-title">还没有客户</div>
            <div className="empty-desc">接入渠道后，客户会自动出现在这里</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
          {customers.map((cst: any) => (
            <div key={cst.id} className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                <div className="avatar-box" style={{ background: pickGradient(cst.name || cst.id || ""), color: "var(--text-primary)" }}>
                  {getInitials(cst.name || "")}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: -0.2, lineHeight: 1.3, marginBottom: 4 }}>
                    {cst.name || "未命名客户"}
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: 12, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{cst.channel || "webchat"}</span>
                    {cst.status && (
                      <>
                        <span style={{ width: 3, height: 3, borderRadius: 999, background: "var(--text-muted)", display: "inline-block" }} />
                        <span>{cst.status}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              {cst.tags && cst.tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {cst.tags.map((t: string, idx: number) => (
                    <span key={t} className={`badge ${tagClasses[idx % tagClasses.length]}`}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
