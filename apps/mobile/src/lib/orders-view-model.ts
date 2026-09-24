/**
 * PHASE MOBILE-05 — 订单页展示层纯函数（零 RN 依赖，可在 Node 下验证）。
 *
 * 契约依据：apps/api/src/agent/tools/search-orders.tool.ts（items 字段）
 *           apps/api/src/mobile/dto/mobile-queries.dto.ts（status 枚举 / from,to 为 YYYY-MM-DD）
 *
 * 原则：
 *   - 金额缺失（服务端按角色裁剪）→ `amountLabel = null`，UI 显示「金额不可见」，**绝不用 0 冒充**
 *   - 状态码未知时不猜测语义，统一兜底文案
 *   - 不做任何业务数值生成
 */

import { formatAmount, formatCount, formatDateTimeShort } from './format';
import type { MobileOrderItem } from './mobile-api';

/* ---------------------------- 状态筛选 ---------------------------- */

export interface OrderStatusOption {
  /** null = 不筛选。 */
  readonly value: string | null;
  readonly label: string;
}

/** 与后端 DTO ORDER_STATUSES 完全一致。 */
export const ORDER_STATUS_OPTIONS: readonly OrderStatusOption[] = [
  { value: null, label: '全部' },
  { value: 'pending', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'shipped', label: '已发货' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
  { value: 'refunded', label: '已退款' },
];

/**
 * 状态标签映射。
 * 依据（实证，非猜测）：
 *   · prisma schema Order.status 注释：pending/paid/shipped/completed/cancelled/refunded
 *   · **生产只读取证**（PHASE MOBILE-05）：库中实际存在 `processing`（WooCommerce 同步订单状态，4 笔）
 *     ⇒ 若不补充 Woo 词表，真实订单会全部显示为「其他状态」
 *   · WooCommerce 标准状态：pending/processing/on-hold/completed/cancelled/refunded/failed/draft/trash
 * 注意：**筛选**仍只能使用后端 DTO 允许的 6 个值（见 ORDER_STATUS_OPTIONS）——
 *       这属后端限制（无法按 processing 筛选），已列入本阶段报告待办，未在本端擅自扩展。
 */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  pending: '待付款',
  processing: '处理中',
  'on-hold': '挂起',
  onhold: '挂起',
  paid: '已付款',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
  failed: '支付失败',
  draft: '草稿',
  trash: '已删除',
};

export type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? '其他状态';
}

export function orderStatusTone(status: string): Tone {
  if (status === 'paid' || status === 'completed') return 'success';
  if (status === 'pending' || status === 'on-hold' || status === 'onhold') return 'warning';
  if (status === 'cancelled' || status === 'refunded' || status === 'failed') return 'danger';
  if (status === 'shipped' || status === 'processing') return 'accent';
  return 'default';
}

/* ---------------------------- 日期筛选 ---------------------------- */

export type RangeKey = 'default' | 'd7' | 'd30' | 'd90';

export interface RangeOption {
  readonly key: RangeKey;
  readonly label: string;
}

/**
 * 说明：服务端不传 from/to 时默认「最近 90 天」；此处只提供相对区间预设。
 * 未提供「今天」预设 —— 后端把 YYYY-MM-DD 解析为 UTC 零点，
 * 与店铺 +08:00 自然日存在 8 小时错位，标为「今天」会造成误导。
 */
export const RANGE_OPTIONS: readonly RangeOption[] = [
  { key: 'default', label: '默认（90 天）' },
  { key: 'd7', label: '近 7 天' },
  { key: 'd30', label: '近 30 天' },
  { key: 'd90', label: '近 90 天' },
];

function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function rangeParams(
  key: RangeKey,
  now: Date = new Date(),
): { readonly from?: string; readonly to?: string } {
  if (key === 'default') return {};
  const days = key === 'd7' ? 7 : key === 'd30' ? 30 : 90;
  const from = new Date(now.getTime() - (days - 1) * DAY_MS);
  const to = new Date(now.getTime() + DAY_MS); // 含今天
  return { from: localDay(from), to: localDay(to) };
}

/* ------------------------------ 列表行 ------------------------------ */

export interface OrderRow {
  readonly key: string;
  readonly orderNo: string;
  readonly statusLabel: string;
  readonly statusTone: Tone;
  readonly customerLabel: string;
  readonly createdLabel: string;
  readonly paidLabel: string | null;
  /** null = 该角色无权查看金额（服务端未下发），UI 显示「金额不可见」。 */
  readonly amountLabel: string | null;
}

export function buildOrderRows(items: readonly MobileOrderItem[]): readonly OrderRow[] {
  return items.map((item) => ({
    key: item.orderNo,
    orderNo: item.orderNo,
    statusLabel: orderStatusLabel(item.status),
    statusTone: orderStatusTone(item.status),
    customerLabel: item.customerNameMasked.trim().length > 0 ? item.customerNameMasked : '未关联客户',
    createdLabel: formatDateTimeShort(item.createdAt) ?? '—',
    paidLabel: item.paidAt ? formatDateTimeShort(item.paidAt) : null,
    amountLabel: item.amount === undefined ? null : formatAmount(item.amount, item.currency),
  }));
}

/** 结果计数文案（total 为 null 时返回 null，不伪造条数）。 */
export function totalLabel(total: number | null): string | null {
  const formatted = formatCount(total);
  return formatted === null ? null : `${formatted} 笔`;
}
