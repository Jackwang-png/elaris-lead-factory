"use client";

/**
 * 管理员后台独立布局
 *
 * 与商家工作台（root-client.tsx → Sidebar）完全分离：
 * - 使用 AdminSidebar（只含平台管理功能）
 * - 不渲染任何商家业务入口（聊天/客户/机器人/知识库等）
 * - 复用同一套 CSS 变量与响应式断点，视觉风格统一
 *
 * 路由保护由 middleware.ts 保证：非 admin 角色访问 /admin/* 会被重定向到 /。
 */

import AdminSidebar from '@/components/admin-sidebar';
import AdminAgentFab from '@/components/admin-agent-fab';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      backgroundImage: `
        radial-gradient(circle at 12% 8%, rgba(59,130,246,0.05), transparent 42%),
        radial-gradient(circle at 88% 92%, rgba(96,165,250,0.04), transparent 40%)
      `,
    }}>
      <AdminSidebar />
      <main
        className="main-content"
        style={{
          padding: '32px 36px 48px',
          minHeight: '100vh',
          maxWidth: '100%',
        }}
      >
        {children}
      </main>

      <AdminAgentFab />

      <style>{`
        /* 桌面布局 — 与 root-client 保持一致 */
        .sidebar-wrap{ position: fixed; left:0; top:0; bottom:0; width:256px; z-index:50; }
        .main-content{ margin-left:256px; }

        /* 平板：适度收窄 */
        @media(max-width:1100px){
          .main-content{ padding: 24px 22px 36px; }
        }

        /* 手机：仅图标栏 */
        @media(max-width:768px){
          .sidebar-wrap{ width:72px; }
          .sidebar-wrap .sb-text{ display:none; }
          .sidebar-wrap .sb-user{ display:none; }
          .sidebar-wrap .sb-item{ justify-content:center; padding: 12px 0 !important; }
          .sidebar-wrap .sb-item span{ display:none; }
          .sidebar-wrap .sb-logo{ justify-content:center; }
          .main-content{ margin-left:72px; padding: 16px 14px 24px; }
        }
      `}</style>
    </div>
  );
}
