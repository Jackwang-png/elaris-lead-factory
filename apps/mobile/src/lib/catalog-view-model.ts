/**
 * PHASE MOBILE-05 — 商品 / 库存展示层纯函数（零 RN 依赖，可在 Node 下验证）。
 *
 * 契约依据：
 *   商品：GET /products（Prisma 整行 → 本端**白名单消费**；价格字段一律不读取）
 *   库存：GET /m/inventory（threshold / lowStock[] / outOfStock[] / rowCount / truncated）
 *
 * 原则：
 *   - 数值为 null → 展示值 null → UI 显示「暂无数据」，**绝不用 0 冒充**
 *   - 空数组是**合法空状态**（不是错误），文案区分「没有数据」与「加载失败」
 *   - 列表被服务端/本端截断时以「N+」标识，不把上限当精确值
 */

import { formatCount } from './format';
import type { MobileInventoryResponse, MobileProductRow } from './mobile-api';

/* ------------------------------ 商品 ------------------------------ */

/** 单屏渲染上限：GET /products 无分页，超出部分不渲染（并提示）。 */
export const PRODUCT_DISPLAY_CAP = 100;

export interface ProductRow {
  readonly key: string;
  readonly name: string;
  readonly skuLabel: string | null;
  readonly stockLabel: string | null;
  readonly statusLabel: string;
  readonly isLowStock: boolean;
}

const PRODUCT_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: '在售',
  draft: '草稿',
  pending: '待处理',
  inactive: '已下架',
  archived: '已归档',
};

export function productStatusLabel(status: string): string {
  return PRODUCT_STATUS_LABELS[status] ?? '其他状态';
}

export interface ProductListModel {
  /** 过滤（isDeleted）+ 截断后的行。 */
  readonly rows: readonly ProductRow[];
  /** 服务端返回的原始条数（含已删除）。 */
  readonly rawCount: number;
  /** 过滤掉已删除商品后的条数。 */
  readonly activeCount: number;
  /** 因单屏上限被截断的条数（0 表示未截断）。 */
  readonly hiddenCount: number;
}

export function buildProductList(
  products: readonly MobileProductRow[],
  lowStockThreshold: number | null = null,
): ProductListModel {
  const active = products.filter((product) => product.isDeleted !== true);
  const visible = active.slice(0, PRODUCT_DISPLAY_CAP);
  return {
    rows: visible.map((product) => ({
      key: product.id,
      name: product.name,
      skuLabel: product.sku && product.sku.trim().length > 0 ? product.sku : null,
      stockLabel: formatCount(product.stockQuantity),
      statusLabel: productStatusLabel(product.status),
      isLowStock:
        product.stockQuantity !== null &&
        lowStockThreshold !== null &&
        product.stockQuantity <= lowStockThreshold,
    })),
    rawCount: products.length,
    activeCount: active.length,
    hiddenCount: Math.max(0, active.length - visible.length),
  };
}

/* ------------------------------ 库存 ------------------------------ */

export interface InventoryRow {
  readonly key: string;
  readonly name: string;
  readonly skuLabel: string | null;
  /** 低库存行显示剩余数量；缺货行无库存字段（服务端未下发）→ null。 */
  readonly stockLabel: string | null;
}

export interface InventorySummary {
  readonly available: boolean;
  readonly thresholdLabel: string | null;
  /** 低库存数量（截断时带 +）。 */
  readonly lowStockCountLabel: string | null;
  /** 缺货数量（截断时带 +）。 */
  readonly outOfStockCountLabel: string | null;
  readonly lowStockRows: readonly InventoryRow[];
  readonly outOfStockRows: readonly InventoryRow[];
  readonly truncated: boolean;
}

export function buildInventorySummary(
  response: MobileInventoryResponse | null,
): InventorySummary {
  if (!response || !response.available) {
    return {
      available: false,
      thresholdLabel: null,
      lowStockCountLabel: null,
      outOfStockCountLabel: null,
      lowStockRows: [],
      outOfStockRows: [],
      truncated: false,
    };
  }

  const lowCount = response.lowStock.length;
  const lowLabel = formatCount(lowCount);
  const outCount = response.outOfStock.length;
  const outLabel = formatCount(outCount);

  return {
    available: true,
    thresholdLabel: formatCount(response.threshold),
    lowStockCountLabel: lowLabel === null ? null : response.truncated ? `${lowLabel}+` : lowLabel,
    outOfStockCountLabel: outLabel,
    lowStockRows: response.lowStock.map((item) => ({
      key: item.id,
      name: item.name,
      skuLabel: item.sku && item.sku.trim().length > 0 ? item.sku : null,
      stockLabel: formatCount(item.stockQuantity),
    })),
    outOfStockRows: response.outOfStock.map((item) => ({
      key: item.id,
      name: item.name,
      skuLabel: item.sku && item.sku.trim().length > 0 ? item.sku : null,
      stockLabel: null,
    })),
    truncated: response.truncated,
  };
}
