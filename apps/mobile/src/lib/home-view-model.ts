/**
 * PHASE MOBILE-04 — 首页视图模型（**纯函数，零 RN 依赖**）。
 *
 * 设计意图：
 *   - UI 只负责渲染本模块产出的字符串，不允许自行推导/补值；
 *   - 由于是纯 TS，可在 Node 下用真实生产响应做验证（见本阶段验证脚本）；
 *   - 语义硬约束：后端返回 null → 展示值为 null → UI 显示「暂无数据」，**绝不用 0 冒充**。
 */

import { formatAmount, formatCount, formatDay, formatDeltaPct } from './format';
import type { MobileHomeResponse, MobileInventoryData } from './mobile-api';

export interface HomeMetric {
  readonly key: string;
  readonly label: string;
  /** 已格式化的展示值；null 表示该值当前不可用。 */
  readonly value: string | null;
  /** 较昨日环比文案；null 表示无对比基数。 */
  readonly delta: string | null;
  readonly tone: 'default' | 'accent' | 'warning';
  /** 口径说明（如「未提供币种」）。null 表示无需说明。 */
  readonly note?: string | null;
}

export interface HomeLowStockRow {
  readonly id: string;
  readonly name: string;
  /** 剩余库存；null 表示服务端未给出该值。 */
  readonly stock: string | null;
}

export interface HomeInventorySummary {
  readonly available: boolean;
  readonly threshold: number | null;
  readonly lowStockCount: string | null;
  /** 缺货数量达到服务端上限时带 `+` 后缀，避免把「上限」当成精确值。 */
  readonly outOfStockCount: string | null;
  readonly topLowStock: readonly HomeLowStockRow[];
}

export interface HomeViewModel {
  readonly metrics: readonly HomeMetric[];
  readonly inventory: HomeInventorySummary;
  /** 数据窗口文案（来自服务端 timeRange），null 表示未提供。 */
  readonly dataWindowLabel: string | null;
  /** 当前是否有任何可用业务数据。 */
  readonly hasAnyData: boolean;
}

/** 服务端 get_product_inventory 的默认 limit（outOfStock 无 total，需据此标识「可能还有更多」）。 */
const INVENTORY_ROW_CAP = 20;

function buildInventory(
  inventory: MobileInventoryData | null,
  truncated: boolean,
): HomeInventorySummary {
  if (!inventory) {
    return {
      available: false,
      threshold: null,
      lowStockCount: null,
      outOfStockCount: null,
      topLowStock: [],
    };
  }

  const outCount = inventory.outOfStock.length;
  const rawOutOfStock = formatCount(outCount);
  const outOfStockCount =
    rawOutOfStock !== null && outCount >= INVENTORY_ROW_CAP && truncated
      ? `${rawOutOfStock}+`
      : rawOutOfStock;

  return {
    available: true,
    threshold: inventory.threshold,
    lowStockCount: formatCount(inventory.lowStockTotal),
    outOfStockCount,
    topLowStock: inventory.lowStock.slice(0, 3).map((item) => ({
      id: item.id,
      name: item.name,
      stock: formatCount(item.stockQuantity),
    })),
  };
}

export function buildHomeViewModel(data: MobileHomeResponse | null): HomeViewModel {
  const metrics = data?.overview?.metrics ?? null;

  const pendingCount = metrics?.pendingHandoffCount ?? null;

  const list: HomeMetric[] = [
    {
      key: 'gmv',
      label: '今日成交额',
      // /m/home 的 overview 不含币种字段（生产实测订单币种为 USD），
      // 因此**不加货币符号**，避免把 USD 金额标成人民币。
      value: metrics ? formatAmount(metrics.gmv, null) : null,
      delta: metrics ? formatDeltaPct(metrics.deltas.gmvPct) : null,
      tone: 'accent',
      note: '接口未提供币种',
    },
    {
      key: 'orderCount',
      label: '今日订单',
      value: metrics ? formatCount(metrics.orderCount) : null,
      delta: metrics ? formatDeltaPct(metrics.deltas.orderCountPct) : null,
      tone: 'default',
    },
    {
      key: 'paidOrderCount',
      label: '已支付订单',
      value: metrics ? formatCount(metrics.paidOrderCount) : null,
      delta: null,
      tone: 'default',
    },
    {
      key: 'newCustomerCount',
      label: '新增客户',
      value: metrics ? formatCount(metrics.newCustomerCount) : null,
      delta: metrics ? formatDeltaPct(metrics.deltas.newCustomerCountPct) : null,
      tone: 'default',
    },
    {
      key: 'pendingHandoffCount',
      label: '待处理人工接待',
      value: metrics ? formatCount(metrics.pendingHandoffCount) : null,
      delta: null,
      tone: pendingCount !== null && pendingCount > 0 ? 'warning' : 'default',
    },
    {
      key: 'conversationCount',
      label: '今日会话',
      value: metrics ? formatCount(metrics.conversationCount) : null,
      delta: metrics ? formatDeltaPct(metrics.deltas.conversationCountPct) : null,
      tone: 'default',
    },
  ];

  const day = data?.timeRange ? formatDay(data.timeRange.from) : null;
  const tz = data?.timeRange?.tz ?? null;

  return {
    metrics: list,
    inventory: buildInventory(data?.inventory ?? null, data?.sections.inventory?.truncated ?? false),
    dataWindowLabel: day ? (tz ? `${day}（${tz}）` : day) : null,
    hasAnyData: Boolean(data?.overview ?? data?.inventory ?? data?.alerts ?? data?.trend),
  };
}
