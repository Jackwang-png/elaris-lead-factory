"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, MessageSquare, Smartphone, BookOpen, Shield, ArrowRight, Loader2, Flame } from "lucide-react";
import { setAuthSession, sanitizeInput, validateEmail, validatePassword, truncateInput, INPUT_LIMITS } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

const plans = [
  { name: "FREE", label: "免费版", price: "¥0", unit: "/月", desc: "适合试用", features: ["100 消息/天", "1 个 Bot", "基础客服"] },
  { name: "BASIC", label: "基础版", price: "¥99", unit: "/月", desc: "适合起步商家", features: ["1000 消息/天", "3 个 Bot", "知识库 + 客服"], hot: true },
  { name: "PRO", label: "专业版", price: "¥299", unit: "/月", desc: "适合成长商家", features: ["10000 消息/天", "10 个 Bot", "高级分析 + 渠道接入"] },
  { name: "ENTERPRISE", label: "企业版", price: "¥999", unit: "/月", desc: "适合企业", features: ["无限消息", "不限 Bot", "专属支持"] },
];

const sellingPoints = [
  { icon: MessageSquare, title: "自动接待", desc: "系统自动理解，自动回答客户问题" },
  { icon: Smartphone, title: "多渠道接入", desc: "微信 / 淘宝 / 抖音，一个后台全搞定" },
  { icon: BookOpen, title: "知识库学习", desc: "上传商品资料，越用越懂你的业务" },
  { icon: Shield, title: "数据安全", desc: "多租户隔离 + 每日自动备份" },
];

export default function Register() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("BASIC");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 实时密码强度（0-5）
  const pwdCheck = validatePassword(password);
  const pwdScore = pwdCheck.score ?? 0;
  const pwdStrong = pwdScore >= 3;

  async function register() {
    // 前置校验
    if (!name.trim()) { setError("请填写店铺名称"); return; }
    const emailResult = validateEmail(email);
    if (!emailResult.valid) { setError(emailResult.error!); return; }
    const pwdResult = validatePassword(password);
    if (!pwdResult.valid) { setError(pwdResult.error!); return; }

    // 长度限制 + 过滤
    const safeName = truncateInput(sanitizeInput(name.trim()), INPUT_LIMITS.name);
    const safeEmail = truncateInput(sanitizeInput(email), INPUT_LIMITS.email).toLowerCase();
    const safePassword = truncateInput(password, INPUT_LIMITS.password);

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          email: safeEmail,
          password: safePassword,
          name: safeName,
          username: safeEmail.split("@")[0],
          plan,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message?.[0] || data.message || "注册失败");
        setLoading(false);
        return;
      }
      setAuthSession({
        token: data.accessToken,
        role: data.user?.role || "merchant",
        name: data.user?.name || safeName,
      });
      router.push("/");
    } catch (e: any) {
      setError("网络错误，请稍后再试");
    }
    setLoading(false);
  }

  return (
    <main style={pageStyle} className="fade-in-up">
      <div aria-hidden style={glowA} />
      <div aria-hidden style={glowB} />

      <div style={{ width: "100%", maxWidth: 980, position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={logoWrap}>
            <div style={logoMark}>
              <Bot size={22} strokeWidth={1.8} color="var(--accent)" />
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "var(--text-primary)", marginTop: 14 }}>
            Smart<span style={{ color: "var(--accent)" }}>CS</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 8 }}>
            注册账号，马上体验 24 小时在线的客服
          </p>
        </div>

        <div style={gridContainer} className="reg-grid">
          <div style={sellingCard} className="selling-col">
            <div style={eyebrow}>核心优势</div>
            <h2 style={sectionTitle}>为什么选择 SmartCS？</h2>
            <p style={sectionSubtitle}>一站式客服解决方案，助力您的业务增长</p>

            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 18 }}>
              {sellingPoints.map(({ icon: Icon, title, desc }) => (
                <div key={title} style={sellingItem}>
                  <div style={iconWrap}>
                    <Icon size={20} strokeWidth={1.8} color="var(--accent)" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={sellingTitle}>{title}</div>
                    <div style={sellingDesc}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={formCard}>
            <div style={eyebrow}>开始使用</div>
            <h1 style={heroTitle}>创建您的账号</h1>
            <p style={heroSubtitle}>选一个套餐，免费开始体验</p>

            <div style={{ marginTop: 20 }}>
              <div style={fieldGroup}>
                <label style={fieldLabel}>店铺 / 公司名称</label>
                <input
                  style={inputBase}
                  placeholder="您的店铺名称"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div style={fieldGroup}>
                <label style={fieldLabel}>邮箱</label>
                <input
                  style={inputBase}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 6 }}>
                <label style={fieldLabel}>密码</label>
                <input
                  style={{
                    ...inputBase,
                    borderColor: password && !pwdStrong ? "rgba(239,68,68,0.5)" : undefined,
                  }}
                  placeholder="至少 8 位，包含字母和数字"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && register()}
                />
                {/* 密码强度指示器 */}
                {password && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: 4,
                            borderRadius: 2,
                            background: i < pwdScore
                              ? pwdScore <= 2 ? "#ef4444" : pwdScore <= 3 ? "#f59e0b" : "#10b981"
                              : "var(--border-default)",
                            transition: "background 0.2s",
                          }}
                        />
                      ))}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: pwdStrong ? "#10b981" : password.length < 8 ? "#ef4444" : "#f59e0b",
                      display: "flex",
                      justifyContent: "space-between",
                    }}>
                      <span>
                        {pwdScore <= 1 ? "太弱" : pwdScore === 2 ? "弱" : pwdScore === 3 ? "良好" : pwdScore >= 4 ? "强" : "极强"}
                      </span>
                      <span style={{ opacity: 0.6 }}>
                        {password.length < 8 ? "需至少 8 位" : ""}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={planGrid} className="plan-grid">
              {plans.map((p) => (
                <div
                  key={p.name}
                  onClick={() => setPlan(p.name)}
                  style={{
                    ...planCardBase,
                    borderColor: plan === p.name ? "var(--accent)" : "var(--border-default)",
                    background: plan === p.name ? "var(--accent-soft)" : "transparent",
                    boxShadow: plan === p.name ? "0 0 0 1px var(--accent), var(--shadow-xs)" : "none",
                  }}
                >
                  {p.hot && (
                    <div style={hotBadge}>
                      <Flame size={11} strokeWidth={2.2} />
                      <span>最受欢迎</span>
                    </div>
                  )}
                  <div style={planLabel}>{p.label}</div>
                  <div style={planPrice}>
                    {p.price}
                    <span style={planUnit}>{p.unit}</span>
                  </div>
                  <div style={planDesc}>{p.desc}</div>
                </div>
              ))}
            </div>

            {error && (
              <div style={errorBox}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--danger)", flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              className="btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                padding: "12.5px 0",
                marginTop: 8,
                fontSize: 14,
                opacity: loading ? 0.7 : 1,
              }}
              onClick={register}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={15} style={{ animation: "spin 0.9s linear infinite" }} />
                  <span>注册中...</span>
                </>
              ) : (
                <>
                  <span>注册并开始使用</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "22px 0 16px" }}>
              <span style={{ flex: 1, height: 1, background: "var(--border-default)" }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.8 }}>或</span>
              <span style={{ flex: 1, height: 1, background: "var(--border-default)" }} />
            </div>

            <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              已有账号？{" "}
              <Link href="/login" style={{ color: "var(--accent)", fontWeight: 600 }}>
                去登录
              </Link>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media(max-width:820px){
          .reg-grid { grid-template-columns: 1fr !important; }
          .selling-col { display: none !important; }
        }
        @media(max-width:480px){
          .plan-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}

/* ---------- 页面基础 ---------- */
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 20% 15%, rgba(59,130,246,0.08), transparent 45%)," +
    "radial-gradient(circle at 82% 88%, rgba(96,165,250,0.08), transparent 40%)," +
    "var(--bg)",
  color: "var(--text-primary)",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",' +
    '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "28px 20px",
  position: "relative",
  overflow: "hidden",
};

const glowA: React.CSSProperties = {
  position: "absolute",
  top: -180, left: "50%", transform: "translateX(-55%)",
  width: 520, height: 520, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(59,130,246,0.10), transparent 60%)",
  filter: "blur(20px)",
  pointerEvents: "none",
};

const glowB: React.CSSProperties = {
  position: "absolute",
  bottom: -200, left: "50%", transform: "translateX(-30%)",
  width: 560, height: 560, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(96,165,250,0.10), transparent 62%)",
  filter: "blur(30px)",
  pointerEvents: "none",
};

const logoWrap: React.CSSProperties = { display: "flex", justifyContent: "center" };
const logoMark: React.CSSProperties = {
  width: 56, height: 56, borderRadius: 16,
  background: "var(--accent-soft)",
  border: "1px solid var(--border-strong)",
  boxShadow: "0 4px 12px var(--accent-glow)",
  display: "flex", alignItems: "center", justifyContent: "center",
};

/* ---------- 排版 ---------- */
const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  color: "var(--accent)",
  marginBottom: 8,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: -0.3,
  color: "var(--text-primary)",
  margin: 0,
  lineHeight: 1.2,
};

const sectionSubtitle: React.CSSProperties = {
  fontSize: 13.5,
  color: "var(--text-secondary)",
  margin: "8px 0 0",
  lineHeight: 1.5,
};

const heroTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: -0.3,
  color: "var(--text-primary)",
  margin: 0,
  lineHeight: 1.2,
};

const heroSubtitle: React.CSSProperties = {
  fontSize: 13.5,
  color: "var(--text-secondary)",
  margin: "8px 0 0",
  lineHeight: 1.5,
};

/* ---------- 布局 ---------- */
const gridContainer: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.1fr 1fr",
  gap: 24,
  alignItems: "start",
};

const sellingCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 20,
  padding: "30px 28px",
  boxShadow: "var(--shadow-lg)",
};

const formCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-default)",
  borderRadius: 20,
  padding: "28px 26px",
  boxShadow: "var(--shadow-lg)",
};

/* ---------- 卖点 ---------- */
const sellingItem: React.CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
};

const iconWrap: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: "var(--accent-soft)",
  border: "1px solid var(--border-subtle)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const sellingTitle: React.CSSProperties = {
  fontWeight: 650,
  fontSize: 14.5,
  color: "var(--text-primary)",
  letterSpacing: -0.1,
};

const sellingDesc: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-tertiary)",
  marginTop: 3,
  lineHeight: 1.5,
};

/* ---------- 表单控件 ---------- */
const fieldGroup: React.CSSProperties = {
  marginBottom: 14,
};

const fieldLabel: React.CSSProperties = {
  display: "inline-block",
  fontSize: 12.5,
  color: "var(--text-secondary)",
  marginBottom: 6,
  fontWeight: 500,
};

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 160ms ease, box-shadow 160ms ease, background 160ms ease",
};

/* ---------- 套餐选择 ---------- */
const planGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 14,
  marginBottom: 8,
};

const planCardBase: React.CSSProperties = {
  borderRadius: 12,
  padding: "14px 12px",
  cursor: "pointer",
  position: "relative",
  border: "1px solid var(--border-default)",
  transition: "all 200ms var(--ease-out)",
};

const hotBadge: React.CSSProperties = {
  position: "absolute",
  top: -10,
  left: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 10.5,
  fontWeight: 700,
  background: "var(--accent)",
  color: "#fff",
  padding: "3px 10px",
  borderRadius: 999,
  boxShadow: "0 4px 12px var(--accent-glow)",
  letterSpacing: 0.2,
};

const planLabel: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 14,
  color: "var(--text-primary)",
  letterSpacing: -0.1,
};

const planPrice: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 750,
  color: "var(--accent)",
  marginTop: 5,
  letterSpacing: -0.3,
  lineHeight: 1,
};

const planUnit: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-tertiary)",
  fontWeight: 500,
  marginLeft: 2,
};

const planDesc: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-tertiary)",
  marginTop: 5,
};

/* ---------- 错误提示 ---------- */
const errorBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 12.5, color: "var(--danger)",
  background: "var(--danger-soft)",
  border: "1px solid rgba(248,113,113,0.2)",
  borderRadius: 10,
  padding: "9px 12px",
  margin: "10px 0 4px",
};

/* ---------- 提交按钮 ---------- */
const submitBtn: React.CSSProperties = {
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12.5px 0",
  marginTop: 8,
  borderRadius: 12,
  border: 0,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(0,0,0,0.28), 0 4px 12px var(--accent-glow)",
  transition: "all var(--transition-base)",
  letterSpacing: 0.1,
};
