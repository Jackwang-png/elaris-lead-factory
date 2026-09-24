/**
 * PHASE MOBILE-04 — 展示层格式化。
 *
 * 核心规则：任何「拿不到/不可用」的数值都返回 **null**，
 * 由 UI 渲染「暂无数据」，绝不用 0 冒充真实值
 * （与后端 Mobile BFF「不可用即 null + warnings」的契约一致）。
 */

/** 千分位整数（手写实现，避免不同 JS 引擎 toLocaleString 行为差异）。 */
export function formatCount(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const truncated = Math.trunc(value);
  const sign = truncated < 0 ? '-' : '';
  const digits = String(Math.abs(truncated));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * 金额格式化（**币种必须由调用方提供**，不硬编码货币符号）。
 *
 * 背景（PHASE MOBILE-05 生产取证）：Order.currency 实际为 "USD"（非 CNY），
 * 因此统一硬编码 ¥ 会把美元金额标成人民币 → 属于错误展示。
 * 规则：
 *   - 已知币种 → 对应符号（CNY ¥ / USD $ / EUR € / GBP £ / JPY ¥）
 *   - 未知币种代码 → 前缀 ISO 代码（如 "AUD 12.34"）
 *   - **未提供币种 → 只显示数字，不加符号**（客户端无币种信息时不臆测货币）
 */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  CNY: '¥',
  RMB: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
};

export function formatAmount(
  value: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const negative = value < 0;
  const [intPart = '0', decPart] = Math.abs(value).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const number = `${grouped}${decPart ? `.${decPart}` : ''}`;

  const code = currency?.trim().toUpperCase() ?? '';
  const symbol = code.length > 0 ? CURRENCY_SYMBOLS[code] : undefined;
  const prefix = symbol ?? (code.length > 0 ? `${code} ` : '');

  return `${negative ? '-' : ''}${prefix}${number}`;
}

/** 环比（后端 deltas 为相对昨日的百分比；null = 无对比基数）。 */
export function formatDeltaPct(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const rounded = Math.round(pct);
  if (rounded === 0) return '与昨日持平';
  return rounded > 0 ? `较昨日 ↑${rounded}%` : `较昨日 ↓${Math.abs(rounded)}%`;
}

/** ISO → HH:mm（本地时区）。 */
export function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** ISO → YYYY-MM-DD（本地时区）。 */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** ISO → MM-DD HH:mm，用于「数据更新时间」。 */
export function formatDateTimeShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const day = formatDay(iso);
  const clock = formatClock(iso);
  if (!day || !clock) return null;
  return `${day.slice(5)} ${clock}`;
}
