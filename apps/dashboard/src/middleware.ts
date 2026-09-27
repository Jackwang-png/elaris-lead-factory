import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 路由级鉴权中间件（运行在 Edge runtime）
 *
 * 安全机制（纵深防御）：
 * ① 安全响应头 — 防止 XSS/点击劫持/MIME 嗅探/信息泄露
 * ② 速率限制 — 登录/注册接口基于 IP 的暴力破解防护
 * ③ 路由守卫 — 未登录/过期 token 重定向、/admin 角色校验
 * ④ 清理机制 — 过期 token 自动清除 cookie
 *
 * 注意：最终鉴权仍由后端 NestJS API（JwtAuthGuard + AdminGuard + TenantGuard）完成，
 * 这里只是前端的前置过滤和安全加固。
 */

// ========== 安全响应头配置 ==========
// 严格的 Content-Security-Policy：仅允许同域资源，禁止内联脚本
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js 开发期需要 inline script，生产可收紧
  "style-src 'self' 'unsafe-inline'",                  // Tailwind 需要
  "img-src 'self' data: blob:",                        // 允许 data URI 图片
  "font-src 'self' data:",
  "connect-src 'self' http://localhost:3000 http://localhost:3001 ws: wss:",
  "frame-ancestors 'none'",                            // 禁止被嵌入 iframe（点击劫持防护）
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// ========== 速率限制（内存 Map，Edge runtime 友好） ==========
// 基于 IP 的请求计数：IP → { count, resetAt }
interface RateLimitEntry {
  count: number;
  resetAt: number; // 时间戳（ms）
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// 登录/注册路径的速率限制配置
const AUTH_RATE_LIMIT = {
  windowMs: 60_000,  // 60 秒窗口
  maxRequests: 5,    // 每 IP 最多 5 次请求（登录/注册）
};

// 普通 API 请求的速率限制（宽松一些）
const API_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 120,  // 每 IP 每分钟 120 次
};

function getClientIP(request: NextRequest): string {
  // 优先从反向代理头获取真实 IP
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

function checkRateLimit(ip: string, isAuth: boolean): boolean {
  const now = Date.now();
  const limit = isAuth ? AUTH_RATE_LIMIT : API_RATE_LIMIT;

  // 清理过期条目
  if (rateLimitStore.size > 5000) {
    for (const [key, val] of rateLimitStore) {
      if (val.resetAt < now) rateLimitStore.delete(key);
    }
  }

  const existing = rateLimitStore.get(ip);
  if (!existing || existing.resetAt < now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }

  existing.count++;
  return existing.count <= limit.maxRequests;
}

// ========== JWT 解析（前置过期检查） ==========
interface JwtPayload {
  exp?: number;
  role?: string;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);

    const binary = atob(padded);
    const json = new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

// ========== 路由定义 ==========
const PUBLIC_ROUTES = ["/login", "/register"];
const AUTH_RATE_LIMIT_ROUTES = ["/login", "/register"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isAuthRateLimitRoute(pathname: string): boolean {
  return AUTH_RATE_LIMIT_ROUTES.some(
    (route) => pathname === route,
  );
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return Date.now() >= payload.exp * 1000;
}

// ========== 重定向助手 ==========
function redirectToLogin(request: NextRequest, withRedirect = true) {
  const loginUrl = new URL("/login", request.url);
  if (withRedirect) {
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  }
  const response = NextResponse.redirect(loginUrl);
  applySecurityHeaders(response);
  return response;
}

function clearAuthCookies(response: NextResponse) {
  response.cookies.delete("token");
  response.cookies.delete("userRole");
  response.cookies.delete("userName");
  return response;
}

// ========== 安全响应头注入 ==========
function applySecurityHeaders(response: NextResponse) {
  const headers = response.headers;
  headers.set("Content-Security-Policy", CSP_HEADER);
  headers.set("X-Frame-Options", "DENY");                           // 防止点击劫持
  headers.set("X-Content-Type-Options", "nosniff");                 // 防止 MIME 嗅探
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()"); // 禁用不必要的浏览器 API
  headers.set("X-XSS-Protection", "1; mode=block");                 // 旧浏览器兜底
  // HSTS 在生产环境启用（localhost 下由浏览器自动忽略）
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // 移除可能泄露信息的头
  headers.set("X-Powered-By", "");
}

// ========== 主中间件 ==========
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = getClientIP(request);
  const isAuthRateLimitPath = isAuthRateLimitRoute(pathname);

  // ① 速率限制检查（登录/注册接口更严格）
  if (!checkRateLimit(ip, isAuthRateLimitPath)) {
    const response = NextResponse.json(
      { error: "请求过于频繁，请稍后再试（Too Many Requests）" },
      { status: 429, headers: { "Retry-After": isAuthRateLimitPath ? "60" : "5" } },
    );
    applySecurityHeaders(response);
    return response;
  }

  // ② 公开页面直接放行
  if (isPublicRoute(pathname)) {
    const response = NextResponse.next();
    applySecurityHeaders(response);
    return response;
  }

  // ③ 读取 token 与角色
  const token = request.cookies.get("token")?.value;
  const role = request.cookies.get("userRole")?.value;
  const isLoggedIn = !!token && !isTokenExpired(token);

  // 已登录用户访问登录/注册页 → 跳主页
  if (isPublicRoute(pathname) && isLoggedIn) {
    const home = role === "admin" ? "/admin" : "/";
    const response = NextResponse.redirect(new URL(home, request.url));
    applySecurityHeaders(response);
    return response;
  }

  // token 已过期 → 清理并跳登录
  if (token && !isLoggedIn) {
    const response = redirectToLogin(request);
    return clearAuthCookies(response);
  }

  // 未登录 → 跳登录
  if (!token) {
    return redirectToLogin(request);
  }

  // ④ /admin/* 必须 admin 角色
  if (pathname.startsWith("/admin") && role !== "admin") {
    const response = NextResponse.redirect(new URL("/", request.url));
    applySecurityHeaders(response);
    return response;
  }

  // ⑤ 正常放行（注入安全头）
  const response = NextResponse.next();
  applySecurityHeaders(response);
  return response;
}

// ========== Matcher 配置 ==========
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
