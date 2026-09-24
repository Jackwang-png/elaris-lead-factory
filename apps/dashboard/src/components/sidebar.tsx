"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Bot, Users, Target, BookOpen, BarChart2, Settings,
  MessageSquare, Briefcase, Monitor, LogOut, Shield,
  Headset, TrendingUp, UserCog,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { clearAuthSession } from '@/lib/auth';

/**
 * 商家工作台侧边栏
 *
 * 只包含商家业务功能（工作台/客户关系/智能助手/账户），
 * 不包含任何平台管理入口。
 *
 * 管理员后台使用独立的 admin-sidebar.tsx，两套布局完全分离。
 * 若当前用户是 admin，在底部提供「进入管理后台」入口，便于切换视角。
 */

/** ownerOnly：仅 OWNER（merchant/admin）可见；CUSTOMER_SERVICE 不展示经营/增长/员工入口。 */
type NavEntry = { name: string; path: string; icon: any; ownerOnly?: boolean };
type NavGroup = { title: string; items: NavEntry[] };

const navGroups: NavGroup[] = [
  {
    title: '经营',
    items: [
      { name: '首页', path: '/', icon: Home },
      { name: 'AI 员工', path: '/bots', icon: Bot },
      { name: '聊天', path: '/chat', icon: MessageSquare, ownerOnly: true },
      { name: '渠道分析', path: '/analytics', icon: BarChart2, ownerOnly: true },
      { name: '代理监控', path: '/agent-monitoring', icon: Monitor, ownerOnly: true },
    ],
  },
  {
    title: '客户',
    items: [
      { name: '客户', path: '/customers', icon: Users },
      { name: '潜在客户', path: '/leads', icon: Target, ownerOnly: true },
    ],
  },
  {
    title: '协作',
    items: [
      { name: '人工客服', path: '/human-support', icon: Headset },
      { name: '知识库', path: '/knowledge', icon: BookOpen },
    ],
  },
  {
    title: '增长与团队',
    items: [
      { name: '增长中心', path: '/growth', icon: TrendingUp, ownerOnly: true },
      { name: '员工中心', path: '/staff', icon: UserCog, ownerOnly: true },
    ],
  },
  {
    title: '账户',
    items: [
      { name: '订阅套餐', path: '/subscription', icon: Briefcase, ownerOnly: true },
      { name: '设置', path: '/settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const role = localStorage.getItem('userRole') || '';
    setIsAdmin(role === 'admin');
    // OWNER = merchant（商家所有者）或平台 admin
    setIsOwner(role === 'merchant' || role === 'admin' || role === 'OWNER');
    setUserName(localStorage.getItem('userName') || '');
  }, []);

  /**
   * 角色可见性（仅 UX）：CUSTOMER_SERVICE 不展示经营/增长/员工管理入口。
   * 注意：前端隐藏不是安全边界，后端 RolesGuard 已做真实鉴权。
   */
  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.ownerOnly || isOwner) }))
    .filter((g) => g.items.length > 0);

  function logout() {
    clearAuthSession();
    router.push('/login');
  }

  const isActive = (p: string) =>
    p === '/' ? pathname === '/' : pathname?.startsWith(p);

  // 取用户名首字母作头像
  const initial = (userName || '?').trim().charAt(0).toUpperCase();

  return (
    <aside className="sidebar-wrap" style={styles.wrap}>
      {/* Logo 区 — WANLAN AI（明亮蓝白，无发光/渐变装饰） */}
      <div style={styles.logoArea}>
        <div style={styles.logoMark}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M4 7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Z"
              stroke="#fff" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M9.5 11h.01M14.5 11h.01M9 14.5c.83.67 2.17.67 3 0s2.17-.67 3 0"
              stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </div>
        <div style={styles.logoTextWrap}>
          <div className="sb-text" style={styles.logoText}>
            WANLAN <span style={{ color: 'var(--accent)' }}>AI</span>
          </div>
          <div style={styles.logoSub}>电商 AI 员工</div>
        </div>
      </div>

      {/* 导航 — 纯商家功能 */}
      <nav className="no-scrollbar" style={styles.nav}>
        {visibleGroups.map((g) => (
          <NavGroupBlock key={g.title} group={g} isActive={isActive} />
        ))}
      </nav>

      {/* 用户区 */}
      <div style={styles.userArea}>
        {/* admin 用户可快速进入管理后台 */}
        {isAdmin && (
          <Link href="/admin" style={{ textDecoration: 'none' }}>
            <div
              className="sb-item"
              style={styles.adminLink}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59,130,246,0.18)';
                (e.currentTarget as HTMLElement).style.color = 'var(--accent-hover)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              <Shield size={15} strokeWidth={1.9} />
              <span className="sb-text">进入管理后台</span>
            </div>
          </Link>
        )}
        <div style={styles.userCard}>
          <div style={styles.avatar}>{initial}</div>
          <div style={styles.userMeta}>
            <div className="sb-text" style={styles.userName} title={userName}>
              {userName || '未登录'}
            </div>
            <div style={styles.userRole}>
              {isAdmin ? '管理员' : '成员'}
            </div>
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

/* ---------- 子组件：导航分组 ---------- */
function NavGroupBlock({
  group, isActive,
}: {
  group: NavGroup;
  isActive: (p: string) => boolean;
}) {
  return (
    <div style={styles.group}>
      <div className="sb-text" style={styles.groupTitle}>{group.title}</div>
      {group.items.map((item) => {
        const active = isActive(item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <NavItem
              active={active}
              icon={<item.icon size={16.5} strokeWidth={1.8} />}
              label={item.name}
            />
          </Link>
        );
      })}
    </div>
  );
}

/* ---------- 子组件：导航项 ---------- */
function NavItem({
  active, icon, label,
}: {
  active: boolean; icon: React.ReactNode; label: string;
}) {
  const [hover, setHover] = useState(false);

  const bg = active
    ? 'var(--accent-soft)'
    : hover
      ? 'var(--bg-hover)'
      : 'transparent';

  const color = active
    ? 'var(--accent-hover)'
    : (hover ? 'var(--text-primary)' : 'var(--text-secondary)');

  const weight = active ? 600 : 500;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '8px 12px',
        borderRadius: 9,
        marginBottom: 2,
        fontSize: 13,
        fontWeight: weight,
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
      }}>
        {icon}
      </div>
      <span className="sb-text" style={{ letterSpacing: 0.1 }}>{label}</span>
    </div>
  );
}

/* ---------- 样式 ---------- */
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
    background: 'var(--accent)',
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
  userArea: {
    padding: '10px 12px 12px',
    borderTop: '1px solid var(--border-subtle)',
  },
  adminLink: {
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
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
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
