"use client";

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/sidebar';

const AUTH_PATHS = ['/login', '/register'];

export default function RootClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = AUTH_PATHS.includes(pathname || '');
  // /admin/* 由 admin/layout.tsx 完全接管（渲染 AdminSidebar），
  // 这里不再叠加商家 Sidebar，避免双重导航。
  const isAdmin = pathname?.startsWith('/admin');

  if (isAuth) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {children}
      </div>
    );
  }

  // admin 路径：直接返回 children，侧边栏由 admin/layout.tsx 负责
  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      // 微噪点/光晕底纹 — 高级感
      backgroundImage: `
        radial-gradient(circle at 12% 8%, rgba(59,130,246,0.05), transparent 42%),
        radial-gradient(circle at 88% 92%, rgba(96,165,250,0.04), transparent 40%)
      `,
    }}>
      <Sidebar />
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

      <style>{`
        /* 桌面布局 */
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
