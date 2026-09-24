"use client";
import { useState, useEffect } from "react";
import { Settings, Check, User, Info, Building2, CreditCard, Bell, Globe } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface SettingsData {
  tenant?: { id: string; name: string; createdAt: string };
  subscription?: {
    planName: string;
    dailyLimit: number;
    status: string;
    expiresAt: string;
  } | null;
  preferences?: {
    language: string;
    timezone: string;
    notificationEnabled: boolean;
    autoReplyEnabled: boolean;
  };
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData>({});
  const [tenantName, setTenantName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`${API}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const settings = await res.json();
          setData(settings);
          setTenantName(settings.tenant?.name || "");
        }
      } catch (e) {
        console.error("Failed to load settings:", e);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantName }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError("保存失败，请稍后再试");
      }
    } catch (e) {
      setError("网络错误，请稍后再试");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="fade-in-up">
        <div className="empty-state">
          <div className="empty-icon"><Settings size={20} strokeWidth={1.7} color="var(--text-tertiary)" /></div>
          <div className="empty-title">加载中</div>
          <div className="empty-desc">正在获取设置信息</div>
        </div>
      </div>
    );
  }

  const planLabels: Record<string, string> = {
    FREE: "免费版", BASIC: "基础版", PRO: "专业版", ENTERPRISE: "企业版",
  };

  return (
    <div style={{ maxWidth: 640 }} className="fade-in-up">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Preferences</div>
          <h1>设置</h1>
          <p className="page-subtitle">账号与偏好设置</p>
        </div>
      </div>

      {/* 店铺信息 */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "var(--accent-soft)", border: "1px solid var(--border-default)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)",
          }}>
            <Building2 size={16} strokeWidth={1.8} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>店铺信息</div>
        </div>

        <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 7 }}>
          店铺名称
        </label>
        <input
          placeholder="输入店铺名称"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
        />

        {data.tenant && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-tertiary)" }}>
            创建时间：{new Date(data.tenant.createdAt).toLocaleDateString('zh-CN')}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Check size={14} strokeWidth={2} />
            {saving ? "保存中..." : "保存设置"}
          </button>
          {saved && (
            <span className="badge badge-success">
              <Check size={12} strokeWidth={2.4} /> 已保存
            </span>
          )}
          {error && (
            <span className="badge badge-danger">{error}</span>
          )}
        </div>
      </div>

      {/* 订阅信息 */}
      {data.subscription && (
        <div className="card" style={{ padding: 24, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "var(--success-soft)", border: "1px solid var(--border-default)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--success)",
            }}>
              <CreditCard size={16} strokeWidth={1.8} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>订阅信息</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>当前套餐</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {planLabels[data.subscription.planName] || data.subscription.planName}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>每日消息上限</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {data.subscription.dailyLimit.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>状态</div>
              <span className="badge badge-success">
                {data.subscription.status === "ACTIVE" ? "已激活" : data.subscription.status}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>到期时间</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                {new Date(data.subscription.expiresAt).toLocaleDateString('zh-CN')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 偏好设置 */}
      {data.preferences && (
        <div className="card" style={{ padding: 24, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "var(--info-soft)", border: "1px solid var(--border-default)",
              display: "flex", alignItems: "center", justifyContent: "center", color: "var(--info)",
            }}>
              <Globe size={16} strokeWidth={1.8} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>偏好设置</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>语言</div>
              <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                {data.preferences.language === "zh-CN" ? "简体中文" : data.preferences.language}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 4 }}>时区</div>
              <div style={{ fontSize: 14, color: "var(--text-primary)" }}>{data.preferences.timezone}</div>
            </div>
          </div>
        </div>
      )}

      {/* 关于 */}
      <div className="card" style={{ padding: 24, marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "var(--info-soft)", border: "1px solid var(--border-default)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--info)",
          }}>
            <Info size={16} strokeWidth={1.8} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>关于</div>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          SmartCS 客服平台 · 让每个小商家都用得起客服
        </p>
      </div>
    </div>
  );
}
