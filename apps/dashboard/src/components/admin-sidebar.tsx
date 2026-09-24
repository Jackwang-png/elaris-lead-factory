"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Building2, Users, ClipboardList,
  LogOut, ArrowLeft,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { clearAuthSession } from '@/lib/auth';

/**
 * 管理员专用侧边栏
 *
 * 与商家侧边栏（sidebar.tsx）完全独立：
 * - 只包含平台管理功能（平台总览/商家管理/用户管理/审计日志）
 * - 不包含任何商家业务功能（聊天/客户/机器人/知识库等）
 * - 底部提供「返回商家工作台」入口，方便超管切换视角
 *
 * 视觉风格与 sidebar.tsx 保持一致，复用同一套 CSS 变量。
 */

type NavEntry = { name: string; path: string; icon: any; desc?: string };

const adminNav: NavEntry[] = [
  { name: '平台总览', path: '/admin', icon: LayoutDashboard, desc: '全量运行数据' },
  { name: '商家管理', path: '/admin/tenants', icon: Building2, desc: '入驻租户列表' },
  { name: '用户管理', path: '/admin/users', icon: Users, desc: '用户与角色' },
  { name: '审计日志', path: '/admin/audit', icon: ClipboardList, desc: '操作溯源' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    setUserName(localStorage.getItem('userName') || '');
  }, []);

  function logout() {
    clearAuthSession();
    router.push('/login');
  }

  // /admin 精确匹配，/admin/xxx 用 startsWith
  const isActive = (p: string) =>
    p === '/admin' ? pathname === '/admin' : pathname?.startsWith(p);

  const initial = (userName || '?').trim().charAt(0).toUpperCase();

  return (
    <aside className="sidebar-wrap" style={styles.wrap}>
      {/* 顶部装饰光晕 */}
      <div style={styles.glow} aria-hidden />

      {/* Logo 区 — 标识这是管理后台 */}
      <div style={styles.logoArea}>
        <div style={styles.logoMark}>
          <LayoutDashboard size={20} strokeWidth={1.8} color="#fff" />
        </div>
        <div style={styles.logoTextWrap}>
          <div className="sb-text" style={styles.logoText}>
            Smart<span style={{ color: 'var(--accent-hover)' }}>CS</span>
          </div>
          <div style={styles.logoSub}>平台管理后台</div>
        </div>
      </div>

      {/* 管理后台标识条 */}
      <div style={styles.adminBadge}>
        <span style={styles.adminBadgeDot} />
        <span className="sb-text">管理员控制台</span>
      </div>

      {/* 导航 — 只有管理功能 */}
      <nav className="no-scrollbar" style={styles.nav}>
        <div style={styles.group}>
          <div className="sb-text" style={styles.groupTitle}>管理</div>
          {adminNav.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <AdminNavItem
                  active={active}
                  icon={<item.icon size={16.5} strokeWidth={1.8} />}
                  label={item.name}
                  desc={item.desc}
                />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 底部：返回商家工作台 + 用户区 */}
      <div style={styles.bottomArea}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div
            className="sb-item"
            style={styles.switchLink}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
            }}
          >
            <ArrowLeft size={15} strokeWidth={1.9} />
            <span className="sb-text">返回商家工作台</span>
          </div>
        </Link>

        <div style={styles.userCard}>
          <div style={styles.avatar}>{initial}</div>
          <div style={styles.userMeta}>
            <div className="sb-text" style={styles.userName} title={userName}>
              {userName || '管理员'}
            </div>
            <div style={styles.userRole}>管理员</div>
          </div>
          <button
            onClick={logout}
            style={styles.logoutBtn}
            title="退出登录"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--danger-soft)';
              (e.currentTarget as HTMLElement).style.color = 'var(--danger)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)';
            }}
          >
            <LogOut size={15} strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- 子组件：导航项 ---------- */
function AdminNavItem({
  active, icon, label, desc,
}: {
  active: boolean; icon: React.ReactNode; label: string; desc?: string;
}) {
  const [hover, setHover] = useState(false);

  const bg = active
    ? 'var(--accent-soft)'
    : hover
      ? 'var(--bg-hover)'
      : 'transparent';

  const color = active
    ? 'var(--accent-hover)'
    : hover
      ? 'var(--text-primary)'
      : 'var(--text-secondary)';

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '9px 12px',
        borderRadius: 9,
        marginBottom: 2,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        background: bg,
        color,
        border: '1px solid transparent',
        transition: 'all var(--transition-base)',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
      }}
      className="sb-item"
    >
      {active && (
        <span style={{
          position: 'absolute',
          left: -4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: 16,
          borderRadius: 999,
          background: 'var(--accent)',
          boxShadow: '0 0 8px var(--accent-glow)',
        }} />
      )}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        opacity: active ? 1 : (hover ? 1 : 0.82),
        transition: 'opacity var(--transition-fast)',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <span className="sb-text" style={{ letterSpacing: 0.1 }}>{label}</span>
    </div>
  );
}

/* ---------- 样式（与 sidebar.tsx 保持一致） ---------- */
const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    left: 0, top: 0, bottom: 0,
    width: 248,
    background: 'var(--bg-elevated)',
    borderRight: '1px solid var(--border-default)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 50,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -120,
    left: -40,
    width: 280,
    height: 200,
    background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
    pointerEvents: 'none',
    opacity: 0.5,
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '18px 18px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    position: 'relative',
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)',
    boxShadow: '0 4px 12px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.18)',
    flexShrink: 0,
  },
  logoTextWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  logoText: {
    fontSize: 16.5,
    fontWeight: 700,
    letterSpacing: -0.3,
    color: 'var(--text-primary)',
    lineHeight: 1.2,
  },
  logoSub: {
    fontSize: 10.5,
    color: 'var(--text-tertiary)',
    letterSpacing: 0.6,
    fontWeight: 500,
  },
  adminBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    margin: '12px 14px 4px',
    padding: '7px 12px',
    borderRadius: 9,
    background: 'var(--accent-soft)',
    border: '1px solid rgba(59,130,246,0.18)',
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--accent-hover)',
    letterSpacing: 0.2,
  },
  adminBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: 'var(--accent)',
    boxShadow: '0 0 6px var(--accent-glow)',
    flexShrink: 0,
  },
  nav: {
    flex: 1,
    padding: '10px 10px',
    overflowY: 'auto',
  },
  group: {
    marginBottom: 14,
  },
  groupTitle: {
    fontSize: 10.5,
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
    padding: '6px 12px 4px',
  },
  bottomArea: {
    padding: '10px 12px 12px',
    borderTop: '1px solid var(--border-subtle)',
  },
  switchLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 9,
    marginBottom: 10,
    fontSize: 12.5,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all var(--transition-base)',
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 8px 8px 10px',
    borderRadius: 11,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--accent) 0%, #6366f1 100%)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
  },
  userMeta: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  userRole: {
    fontSize: 11,
    color: 'var(--text-tertiary)',
    marginTop: 1,
  },
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    background: 'transparent',
    border: 0,
    color: 'var(--text-tertiary)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all var(--transition-fast)',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
};
