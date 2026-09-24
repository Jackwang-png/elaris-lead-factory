"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, CheckCircle, MessageSquare, Coins, Sparkles } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function SubscriptionPage() {
  const [sub, setSub] = useState<any>(null);
  const [usage, setUsage] = useState<any>({ messageCount: 0, tokenUsage: 0 });
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const [subRes, usageRes, plansRes] = await Promise.all([
          fetch(`${API}/subscription/current`, { headers }),
          fetch(`${API}/usage/daily`, { headers }),
          fetch(`${API}/subscription/plans`),
        ]);
        if (subRes.ok) setSub(await subRes.json());
        if (usageRes.ok) setUsage(await usageRes.json());
        if (plansRes.ok) setPlans(await plansRes.json());
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    fetchData();
  }, []);

  const planMap: any = { FREE: "免费版", BASIC: "基础版", PRO: "专业版", ENTERPRISE: "企业版" };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Star size={22} strokeWidth={1.7} color="var(--accent)" /></div>
        <div className="empty-title">加载中</div>
        <div className="empty-desc">正在获取套餐信息</div>
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Billing</div>
          <h1>订阅套餐</h1>
          <p className="page-subtitle">管理您的套餐和用量</p>
        </div>
      </div>

      {/* 当前套餐 + 用量 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }} className="sub-grid">
        <div className="stat-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "var(--accent-soft)", border: "1px solid var(--border-default)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
            }}>
              <Star size={15} strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", fontWeight: 600, letterSpacing: 0.3 }}>当前套餐</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "var(--accent)", letterSpacing: -0.6 }}>
            {planMap[sub?.plan] || sub?.plan || "无"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}>
            {sub?.status === "active" ? (
              <span className="badge badge-success"><CheckCircle size={11} strokeWidth={2.2} /> 使用中</span>
            ) : `状态：${sub?.status || "无订阅"}`}
            {sub?.expireAt && <span>· 到期 {new Date(sub.expireAt).toLocaleDateString()}</span>}
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "var(--success-soft)", border: "1px solid var(--border-default)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)",
            }}>
              <Sparkles size={15} strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", fontWeight: 600, letterSpacing: 0.3 }}>今日用量</div>
          </div>
          <div style={{ display: "flex", gap: 32, marginTop: 8 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 26, fontWeight: 800, color: "var(--success)", letterSpacing: -0.5 }}>
                <MessageSquare size={15} strokeWidth={2} />
                {usage?.messageCount ?? 0}
              </div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 3 }}>消息数</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 26, fontWeight: 800, color: "var(--success)", letterSpacing: -0.5 }}>
                <Coins size={15} strokeWidth={2} />
                {usage?.tokenUsage ?? 0}
              </div>
              <div style={{ color: "var(--text-tertiary)", fontSize: 12, marginTop: 3 }}>Token</div>
            </div>
          </div>
        </div>
      </div>

      {/* 可选套餐 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>可选套餐</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
        {(plans.length ? plans : [
          { name: "FREE", label: "免费版", price: 0, features: ["100 条/天", "基础客服"] },
          { name: "BASIC", label: "基础版", price: 99, features: ["1000 条/天", "知识库", "多渠道"] },
          { name: "PRO", label: "专业版", price: 299, features: ["10000 条/天", "高级分析", "客户画像"] },
          { name: "ENTERPRISE", label: "企业版", price: 999, features: ["无限量", "专属支持", "私有化咨询"] },
        ]).map((p: any) => {
          const isCurrent = sub?.plan === p.name;
          return (
            <div
              key={p.name}
              className="card"
              style={{
                padding: 22,
                border: isCurrent ? "1px solid var(--accent)" : undefined,
                boxShadow: isCurrent ? "var(--shadow-accent), var(--shadow-sm)" : undefined,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{p.label || p.name}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent)", margin: "10px 0 12px", letterSpacing: -0.5 }}>
                ¥{p.price}
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500, marginLeft: 2 }}>/月</span>
              </div>
              {(p.features || []).map((f: string) => (
                <div key={f} style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "4px 0", display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle size={12} strokeWidth={2} color="var(--success)" />
                  {f}
                </div>
              ))}
              {isCurrent ? (
                <div style={{ marginTop: 16 }}>
                  <span className="badge badge-info">当前套餐</span>
                </div>
              ) : (
                <Link href="https://app.wan-wan.xyz/subscription" className="btn-ghost" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>
                  升级 →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@media(max-width:800px){ .sub-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}
