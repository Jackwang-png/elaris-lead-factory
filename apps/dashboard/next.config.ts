import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 在 pnpm monorepo 下已能正确解析路径
  // 不需要手动修改 turbopack root，移除了错误的配置

  // 安全：移除 X-Powered-By 响应头，防止技术栈信息泄露
  poweredByHeader: false,
};

export default nextConfig;
