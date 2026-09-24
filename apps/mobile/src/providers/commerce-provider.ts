/**
 * 合作商 API — 适配器架构设计（DESIGN ONLY · 不实装）
 * ------------------------------------------------------------------
 * 目标：未来接入任何电商 / ERP 平台时，只新增一个 Adapter，
 *       不重写 Mobile App，也不让合作商字段直接污染 Mobile UI。
 *
 * 数据流（不变）：
 *   合作商 API ──Adapter──▶ NormalizedModel ──▶ WANLAN BFF ──▶ Mobile App
 *
 * 关键约束：
 *   · Mobile App 永远只依赖 WANLAN 自己的 BFF 契约（/m/*、/agent/*），
 *     绝不直接消费合作商字段。
 *   · 合作商字段先在 Adapter 层归一化（Provider → NormalizedModel），
 *     再交给 BFF；UI 只看 NormalizedModel。
 *   · 本文件为重设计契约，所有方法默认抛出 NotImplemented，
 *     不发起任何真实网络请求、不接任何未签约合作商。
 */

/* ============================ 归一化模型 ============================ */

export interface NormalizedOrder {
  orderNo: string;
  status: string;
  customerNameMasked: string;
  createdAt: string;
  paidAt: string | null;
  amount: number | null;
  currency: string | null;
  /** 来源合作商标识，仅用于审计，不进入 UI 展示文案。 */
  source: string;
}

export interface NormalizedProduct {
  sku: string;
  name: string;
  status: 'active' | 'inactive' | 'archived';
  stock: number | null;
  price: number | null;
  currency: string | null;
}

export interface NormalizedInventoryItem {
  sku: string;
  name: string;
  stock: number | null;
  threshold: number | null;
  state: 'normal' | 'low' | 'out';
  source: string;
}

export interface NormalizedCustomer {
  id: string;
  nameMasked: string;
  orderCount: number | null;
  lastOrderAt: string | null;
  source: string;
}

export interface NormalizedStoreInfo {
  storeId: string;
  name: string;
  locale: string;
  currency: string;
  source: string;
}

export interface ProviderEvent {
  type: 'order.created' | 'order.updated' | 'inventory.changed' | 'customer.created';
  payload: unknown;
  occurredAt: string;
  source: string;
}

/* ============================ Provider 契约 ============================ */

export interface OrderQuery {
  page?: number;
  limit?: number;
  status?: string;
  keyword?: string;
  /** 形如 { from, to } 的 ISO 区间，由 Adapter 翻译为合作商参数。 */
  range?: { from: string; to: string };
}

export interface CommerceProvider {
  /** 稳定标识，例如 'woocommerce' / 'partner-x' / 'future-erp'。 */
  readonly id: string;
  /** 展示名（仅后台/审计用）。 */
  readonly label: string;
  /** 声明支持的能力，UI 与 BFF 据此判断可用功能。 */
  readonly capabilities: ReadonlyArray<'orders' | 'products' | 'inventory' | 'customers' | 'store' | 'webhook'>;

  fetchOrders(query: OrderQuery): Promise<{ items: NormalizedOrder[]; total: number | null; hasMore: boolean }>;
  fetchProducts(query: { page?: number; limit?: number; keyword?: string }): Promise<{ items: NormalizedProduct[]; total: number | null; hasMore: boolean }>;
  fetchInventory(query: { lowOnly?: boolean }): Promise<NormalizedInventoryItem[]>;
  fetchCustomers(query: { page?: number; limit?: number; keyword?: string }): Promise<{ items: NormalizedCustomer[]; total: number | null; hasMore: boolean }>;
  fetchStore(): Promise<NormalizedStoreInfo>;
  /** 订阅事件（webhook / 轮询由具体 Adapter 决定）。 */
  subscribeEvents?(handler: (event: ProviderEvent) => void): () => void;
}

/* ============================ Adapter 基类 ============================ */

export abstract class BaseProviderAdapter implements CommerceProvider {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly capabilities: ReadonlyArray<'orders' | 'products' | 'inventory' | 'customers' | 'store' | 'webhook'>;

  protected notImplemented(): never {
    throw new Error(`[CommerceProvider:${this.id}] 适配器未实装（当前仅为架构设计）。`);
  }

  fetchOrders(_query: OrderQuery): Promise<{ items: NormalizedOrder[]; total: number | null; hasMore: boolean }> {
    return this.notImplemented();
  }
  fetchProducts(_query: { page?: number; limit?: number; keyword?: string }): Promise<{ items: NormalizedProduct[]; total: number | null; hasMore: boolean }> {
    return this.notImplemented();
  }
  fetchInventory(_query: { lowOnly?: boolean }): Promise<NormalizedInventoryItem[]> {
    return this.notImplemented();
  }
  fetchCustomers(_query: { page?: number; limit?: number; keyword?: string }): Promise<{ items: NormalizedCustomer[]; total: number | null; hasMore: boolean }> {
    return this.notImplemented();
  }
  fetchStore(): Promise<NormalizedStoreInfo> {
    return this.notImplemented();
  }
}

/**
 * 以下为「未来可插接」的占位 Adapter。
 * 拿到真实合作商 API 与授权后，只需继承 BaseProviderAdapter 并实现对应方法，
 * 将合作商响应映射为 NormalizedModel 即可——Mobile / BFF 契约无需改动。
 */
export class WooCommerceAdapter extends BaseProviderAdapter {
  readonly id = 'woocommerce';
  readonly label = 'WooCommerce';
  readonly capabilities = ['orders', 'products', 'inventory', 'customers', 'store', 'webhook'] as const;
}

export class PartnerAdapter extends BaseProviderAdapter {
  readonly id = 'partner';
  readonly label = '合作商（待签约）';
  readonly capabilities = [] as const;
}

export class FutureERPAdapter extends BaseProviderAdapter {
  readonly id = 'future-erp';
  readonly label = '未来 ERP';
  readonly capabilities = [] as const;
}
