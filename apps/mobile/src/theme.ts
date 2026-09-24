/**
 * WANLAN AI 主题（统一设计系统 · Mobile · Light）。
 * 视觉方向：明亮 · 蓝白 · 极简 · 高级 SaaS。
 * 品牌：白底 #FFFFFF · 主蓝 #2563EB · 青 #22D3EE（少量点缀）
 * 与 apps/website 的 Web 设计系统共用同一套语义令牌。
 *
 * 增量扩展：原有导出（colors/spacing/radius/typography）保持键名不变，
 * 仅将取值改为亮色，避免破坏既有屏幕。
 */
export const colors = {
  bg: '#FFFFFF',
  bgElevated: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textSecondary: '#334155',
  textTertiary: '#64748B',
  primary: '#2563EB',
  accent: '#22D3EE',
  success: '#16A34A',
  warning: '#F59E0B',
  danger: '#DC2626',
  info: '#0EA5E9',
  /** 主按钮/品牌块上的文字色（亮底蓝按钮 → 白字）。 */
  onAccent: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  caption: { fontSize: 12.5, color: colors.textSecondary },
  label: { fontSize: 11, color: colors.textTertiary, letterSpacing: 1.6, textTransform: 'uppercase' as const },
} as const;

/** 阴影：非常轻，克制浮起感，避免厚重。 */
export const shadows = {
  xs: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sm: { shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md: { shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  lg: { shadowColor: '#0F172A', shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  brand: { shadowColor: '#2563EB', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
} as const;

/** 语义状态色映射，集中管理「成功/警告/危险/强调/信息/中性」。 */
export const status = {
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  accent: colors.accent,
  info: colors.info,
  neutral: colors.textSecondary,
} as const;

/** 将统一状态名映射到颜色，供各屏复用，避免散落硬编码。 */
export type Tone = 'success' | 'warning' | 'danger' | 'accent' | 'info' | 'neutral';
export function toneColor(tone: Tone): string {
  return status[tone];
}

export const theme = { colors, spacing, radius, typography, shadows, status } as const;
export type Theme = typeof theme;
