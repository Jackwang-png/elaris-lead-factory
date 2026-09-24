/**
 * Auth 会话管理 + 安全工具
 *
 * 安全机制：
 * - setCookie 使用 sameSite=lax，防止 CSRF 窃取 token
 * - sanitizeInput 过滤危险标签/事件属性，防止存储型 XSS
 * - validateEmail / validatePassword 前置校验，减少无效请求
 *
 * 注意：cookie 非 httpOnly，理论上可被 XSS 读取；
 * 因此 sanitizeInput 是前端必须守住的防线，配合 CSP 可大幅降低 XSS 风险。
 */

export interface AuthSession {
  token: string;
  role: string;
  name: string;
}

// cookie 有效期：7 天
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

// ========== XSS 过滤 ==========
/**
 * 清理用户输入中的危险内容：
 * - 移除 <script>、<iframe>、<object>、<embed> 标签
 * - 移除事件属性（onerror=、onclick=、onload= 等）
 * - 移除 javascript: 协议 URL
 * - 转义剩余的 < > & " '
 *
 * 用于所有来自用户输入、将被渲染到 DOM 的文本字段。
 */
export function sanitizeInput(input: string): string {
  if (!input) return "";
  let s = input;

  // 移除危险标签（大小写不敏感）
  s = s.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  s = s.replace(/<\s*iframe[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, "");
  s = s.replace(/<\s*(object|embed|applet|base|link|meta|style)[^>]*>/gi, "");
  s = s.replace(/<\s*\/\s*(object|embed|applet)\s*>/gi, "");

  // 移除事件属性：onxxx="..." 或 onxxx='...'
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "");
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "");

  // 移除 javascript: 协议
  s = s.replace(/javascript\s*:/gi, "");
  s = s.replace(/vbscript\s*:/gi, "");
  s = s.replace(/data\s*:\s*text\/html/gi, "");

  // HTML 转义（保留引号用于属性值）
  s = s.replace(/&/g, "&amp;");
  s = s.replace(/</g, "&lt;");
  s = s.replace(/>/g, "&gt;");
  s = s.replace(/"/g, "&quot;");
  s = s.replace(/'/g, "&#x27;");

  return s;
}

// ========== 邮箱验证 ==========
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) return { valid: false, error: "请输入邮箱" };
  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!EMAIL_RE.test(email)) return { valid: false, error: "邮箱格式不正确" };
  return { valid: true };
}

// ========== 密码验证 ==========
export function validatePassword(password: string): { valid: boolean; error?: string; score?: number } {
  if (!password) return { valid: false, error: "请输入密码", score: 0 };
  if (password.length < 8) return { valid: false, error: "密码至少 8 位", score: 1 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score < 3) {
    return { valid: false, error: "密码强度不足：建议包含大小写字母和数字", score };
  }
  return { valid: true, score };
}

// ========== 输入长度限制 ==========
export const INPUT_LIMITS = {
  email: 254,      // RFC 5321 标准
  password: 128,   // 超过 bcrypt 限制自动截断
  name: 100,
  description: 500,
  content: 50000,
  search: 200,
};

export function truncateInput(input: string, maxLength: number): string {
  if (!input) return "";
  return input.length > maxLength ? input.slice(0, maxLength) : input;
}

// ========== Cookie 操作（sameSite=lax 防 CSRF） ==========
function setCookie(name: string, value: string) {
  const encoded = encodeURIComponent(value);
  // sameSite=lax：允许顶级导航携带 cookie，阻止跨站子请求
  // 注意：在 https 生产环境应加上 Secure 标志
  document.cookie = `${name}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

// ========== 会话管理 ==========
/** 登录/注册成功后调用：同时写入 localStorage 与 cookie */
export function setAuthSession(session: AuthSession): void {
  if (typeof window === "undefined") return;

  // 存储前先 sanitize 用户名（防止存储型 XSS）
  const safeName = sanitizeInput(session.name);

  localStorage.setItem("token", session.token);
  localStorage.setItem("userRole", session.role);
  localStorage.setItem("userName", safeName);

  setCookie("token", session.token);
  setCookie("userRole", session.role);
  setCookie("userName", safeName);
}

/** 登出 / 401 时调用：清理 localStorage 与 cookie */
export function clearAuthSession(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem("token");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");

  clearCookie("token");
  clearCookie("userRole");
  clearCookie("userName");
}

/** 读取当前 token（仅客户端） */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}
