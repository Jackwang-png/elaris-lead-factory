"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bot, ArrowRight, Loader2, MessageSquare, ShieldCheck, Zap,
} from "lucide-react";
import { setAuthSession, sanitizeInput, validateEmail, validatePassword, truncateInput, INPUT_LIMITS } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    // 前置输入校验
    const emailResult = validateEmail(email);
    if (!emailResult.valid) { setError(emailResult.error!); return; }
    const pwdResult = validatePassword(password);
    if (!pwdResult.valid) { setError(pwdResult.error!); return; }

    // 长度限制 + XSS 过滤
    const safeEmail = truncateInput(sanitizeInput(email), INPUT_LIMITS.email).toLowerCase();
    const safePassword = truncateInput(password, INPUT_LIMITS.password);  // 密码不清空，仅限长

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // CSRF 防护：提交原始 email 作为简单的 anti-spam 标记
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ email: safeEmail, password: safePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 不泄露具体错误类型（枚举攻击防护）
        setError(data.message || "账号或密码错误");
        setLoading(false);
        return;
      }
      setAuthSession({
        token: data.accessToken || data.token,
        role: data.user?.role || "user",
        name: data.user?.name || safeEmail.split("@")[0],
      });
      const role = data.user?.role;
      router.push(role === "admin" ? "/admin" : "/");
    } catch (e: any) {
      setError("网络错误，请稍后再试");
    }
    setLoading(false);
  }

  return (
    <main style={pageStyle}>
      {/* ===== 左侧：品牌展示区 ===== */}
      <section className="login-brand" style={brandSide}>
        <div style={brandGlow} aria-hidden />
        <div style={brandGrid} aria-hidden />

        <div style={brandContent}>
          {/* Logo */}
          <div style={brandLogoRow}>
            <div style={brandLogoMark}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Z"
                  stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M9.5 11h.01M14.5 11h.01M9 14.5c.83.67 2.17.67 3 0s2.17-.67 3 0"
                  stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </div>
            <div style={brandLogoText}>
              Smart<span style={{ color: "rgba(255,255,255,0.7)" }}>CS</span>
            </div>
          </div>

          {/* 标语 */}
          <div style={{ marginTop: 64 }}>
            <div style={brandEyebrow}>新一代智能客服平台</div>
            <h1 style={brandTitle}>
              让每一次对话<br />都创造价值
            </h1>
            <p style={brandDesc}>
              AI 驱动的全渠道客服系统，覆盖微信、抖音、小红书，7×24 小时智能响应，
              让客服团队效率提升 10 倍。
            </p>
          </div>

          {/* 特性亮点 */}
          <div style={featureList}>
            {features.map((f) => (
              <div key={f.title} style={featureItem}>
                <div style={featureIcon}>{f.icon}</div>
                <div>
                  <div style={featureTitle}>{f.title}</div>
                  <div style={featureDesc}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 底部 */}
          <div style={brandFooter}>© {new Date().getFullYear()} SmartCS · 企业级智能客服</div>
        </div>
      </section>

      {/* ===== 右侧：表单区 ===== */}
      <section className="login-form-side" style={formSide}>
        <div style={formGlow} aria-hidden />

        <div style={formWrap} className="fade-in-up">
          {/* 移动端 Logo */}
          <div className="login-mobile-logo" style={mobileLogo}>
            <div style={mobileLogoMark}>
              <Bot size={20} strokeWidth={1.8} color="var(--accent)" />
            </div>
            <div style={mobileLogoText}>
              Smart<span style={{ color: "var(--accent)" }}>CS</span>
            </div>
          </div>

          <div style={formHeader}>
            <div style={formEyebrow}>欢迎回来</div>
            <h1 style={formTitle}>登录您的账户</h1>
            <p style={formSubtitle}>输入凭据以进入控制台</p>
          </div>

          {/* Email */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>邮箱</label>
            <input
              style={inputStyle}
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div style={fieldGroup}>
            <div style={labelRow}>
              <label style={fieldLabel}>密码</label>
              <a style={forgotLink}>忘记密码？</a>
            </div>
            <input
              style={inputStyle}
              placeholder="••••••••"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
            />
          </div>

          {/* Error */}
          {error && (
            <div style={errorBox}>
              <span style={errorDot} />
              <span>{error}</span>
            </div>
          )}

          {/* 提交按钮 */}
          <button
            className="btn-primary"
            style={{ ...submitBtn, opacity: loading ? 0.75 : 1 }}
            onClick={login}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 size={15} style={{ animation: "spin 0.9s linear infinite" }} /><span>登录中...</span></>
            ) : (
              <><span>登录系统</span><ArrowRight size={15} /></>
            )}
          </button>

          {/* Divider */}
          <div style={divider}>
            <span style={dividerLine} />
            <span style={dividerText}>或</span>
            <span style={dividerLine} />
          </div>

          <p style={registerHint}>
            还没有账号？{" "}
            <Link href="/register" style={registerLink}>
              免费注册 →
            </Link>
          </p>
        </div>
      </section>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 880px) {
          .login-brand { display: none !important; }
          .login-mobile-logo { display: flex !important; }
          .login-form-side { flex: 1 1 100% !important; }
        }
      `}</style>
    </main>
  );
}

/* ---------- 特性数据 ---------- */
const features = [
  { icon: <Zap size={16} strokeWidth={2} />, title: "AI 智能回复", desc: "秒级响应，意图精准识别" },
  { icon: <MessageSquare size={16} strokeWidth={2} />, title: "全渠道接入", desc: "微信 / 抖音 / 小红书统一管理" },
  { icon: <ShieldCheck size={16} strokeWidth={2} />, title: "企业级安全", desc: "多租户隔离，完整审计日志" },
];

/* ---------- 页面 ---------- */
const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  color: "var(--text-primary)",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",' +
    '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
  background: "var(--bg)",
};

/* ---------- 左侧品牌区 ---------- */
const brandSide: React.CSSProperties = {
  flex: "1 1 52%",
  position: "relative",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "48px 56px",
  overflow: "hidden",
  background:
    "linear-gradient(155deg, #0f1729 0%, #111c34 45%, #0d1424 100%)",
  borderRight: "1px solid var(--border-default)",
};
const brandGlow: React.CSSProperties = {
  position: "absolute",
  top: "-15%", left: "-10%",
  width: 600, height: 600, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(59,130,246,0.18), transparent 65%)",
  pointerEvents: "none",
};
const brandGrid: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)," +
    "linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
  maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 80%)",
  WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, #000 30%, transparent 80%)",
  pointerEvents: "none",
};
const brandContent: React.CSSProperties = {
  position: "relative",
  zIndex: 2,
  maxWidth: 440,
};
const brandLogoRow: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
};
const brandLogoMark: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 11,
  background: "linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "0 6px 18px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.2)",
};
const brandLogoText: React.CSSProperties = {
  fontSize: 19, fontWeight: 700, letterSpacing: -0.3, color: "#fff",
};
const brandEyebrow: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, letterSpacing: 1.6,
  textTransform: "uppercase", color: "rgba(96,165,250,0.85)",
  marginBottom: 14,
};
const brandTitle: React.CSSProperties = {
  fontSize: 38, fontWeight: 800, letterSpacing: -1, lineHeight: 1.15,
  color: "#fff", margin: "0 0 18px",
};
const brandDesc: React.CSSProperties = {
  fontSize: 14.5, lineHeight: 1.7, color: "rgba(255,255,255,0.6)",
  maxWidth: 380, margin: 0,
};
const featureList: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 14,
  marginTop: 40,
};
const featureItem: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 13,
};
const featureIcon: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(59,130,246,0.12)",
  border: "1px solid rgba(59,130,246,0.22)",
  color: "rgba(96,165,250,0.95)",
};
const featureTitle: React.CSSProperties = {
  fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,0.9)",
};
const featureDesc: React.CSSProperties = {
  fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 1,
};
const brandFooter: React.CSSProperties = {
  marginTop: 56, fontSize: 11.5, color: "rgba(255,255,255,0.3)",
};

/* ---------- 右侧表单区 ---------- */
const formSide: React.CSSProperties = {
  flex: "1 1 48%",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "40px 24px",
  position: "relative",
  overflow: "hidden",
};
const formGlow: React.CSSProperties = {
  position: "absolute",
  bottom: "-20%", right: "-10%",
  width: 480, height: 480, borderRadius: "50%",
  background: "radial-gradient(circle, rgba(99,102,241,0.08), transparent 65%)",
  pointerEvents: "none",
};
const formWrap: React.CSSProperties = {
  width: "100%", maxWidth: 380, position: "relative", zIndex: 2,
};
const mobileLogo: React.CSSProperties = {
  display: "none", alignItems: "center", gap: 10,
  marginBottom: 32, justifyContent: "center",
};
const mobileLogoMark: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 11,
  background: "linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)",
  display: "flex", alignItems: "center", justifyContent: "center",
  boxShadow: "0 4px 12px var(--accent-glow)",
};
const mobileLogoText: React.CSSProperties = {
  fontSize: 18, fontWeight: 700, color: "var(--text-primary)",
};
const formHeader: React.CSSProperties = {
  marginBottom: 26,
};
const formEyebrow: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 600, letterSpacing: 1.4,
  textTransform: "uppercase", color: "var(--accent)",
  marginBottom: 8,
};
const formTitle: React.CSSProperties = {
  fontSize: 24, fontWeight: 700, letterSpacing: -0.5,
  color: "var(--text-primary)", margin: "0 0 6px",
};
const formSubtitle: React.CSSProperties = {
  fontSize: 13.5, color: "var(--text-secondary)", margin: 0,
};
const fieldGroup: React.CSSProperties = {
  marginBottom: 16,
};
const labelRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  marginBottom: 7,
};
const fieldLabel: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)",
  letterSpacing: 0.1,
};
const forgotLink: React.CSSProperties = {
  fontSize: 12, color: "var(--text-tertiary)",
  cursor: "pointer", transition: "color 150ms ease",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1px solid var(--border-default)",
  background: "var(--bg-surface)", color: "var(--text-primary)",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
const errorBox: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 12.5, color: "var(--danger)",
  background: "var(--danger-soft)",
  border: "1px solid rgba(248,113,113,0.2)",
  borderRadius: 10, padding: "9px 12px", marginBottom: 12,
};
const errorDot: React.CSSProperties = {
  width: 6, height: 6, borderRadius: 999, background: "var(--danger)", flexShrink: 0,
};
const submitBtn: React.CSSProperties = {
  width: "100%", padding: "12.5px 0", marginTop: 4,
};
const divider: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12,
  margin: "24px 0 16px",
};
const dividerLine: React.CSSProperties = {
  flex: 1, height: 1, background: "var(--border-default)",
};
const dividerText: React.CSSProperties = {
  fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.8,
};
const registerHint: React.CSSProperties = {
  textAlign: "center", fontSize: 13, color: "var(--text-secondary)", margin: 0,
};
const registerLink: React.CSSProperties = {
  color: "var(--accent)", fontWeight: 600,
};
