/**
 * PHASE MOBILE-04 — Mobile BFF 客户端（严格类型版）。
 *
 * 类型契约来源（后端真实实现，非推测）：
 *   apps/api/src/mobile/mobile.service.ts             → /m/home 聚合结构（透传 Tool 结果）
 *   apps/api/src/agent/tools/store-overview.tool.ts   → overview.data = { metrics, compare }
 *   apps/api/src/agent/tools/product-inventory.tool.ts→ inventory.data = { threshold, lowStock, outOfStock, lowStockTotal }
 *   apps/api/src/mobile/dto/mobile-queries.dto.ts     → sections 为**逗号分隔字符串**
 *   apps/api/src/agent/agent.types.ts                 → AgentTimeRange / AgentSourceFact
 *
 * 安全：
 *   - 全部 GET，不发送 tenantId / userId / role（由服务端 JWT 解析；
 *     服务端 ValidationPipe(whitelist + forbidNonWhitelisted) 对额外参数返回 400）
 *   - token 由 src/lib/api.ts 的拦截器从 SecureStore 注入，本文件不接触、不记录 token
 *   - 金额单位：元（CNY），后端 gmv 已做 Math.round(x*100)/100
 */

import { api } from './api';

export interface MobileTimeRange {
  readonly from: string;
  readonly to: string;
  readonly tz: string;
}

export interface MobileSourceFact {
  readonly tool: string;
  readonly asOf: string;
  readonly timeRange?: string | null;
  readonly rowCount?: number;
}

export interface MobileSectionMeta {
  readonly tool: string;
  readonly ok: boolean;
  readonly error: string | null;
  readonly cached: boolean;
  readonly rowCount: number | null;
  readonly truncated: boolean;
}

/* ---------------------------- overview 段 ---------------------------- */

export interface MobileOverviewDeltas {
  readonly orderCountPct: number | null;
  readonly gmvPct: number | null;
  readonly conversationCountPct: number | null;
  readonly newCustomerCountPct: number | null;
}

/** get_store_overview 的当日指标。数值一律真实；服务端不可用时整段为 null（不会补 0）。 */
export interface MobileOverviewMetrics {
  readonly orderCount: number;
  readonly gmv: number;
  readonly paidOrderCount: number;
  readonly conversationCount: number;
  readonly newCustomerCount: number;
  readonly pendingHandoffCount: number;
  readonly deltas: MobileOverviewDeltas;
}

/** 昨日对比块（compareToYesterday=false 时为 null）。 */
export interface MobileOverviewCompare {
  readonly timeRange: MobileTimeRange;
  readonly orderCount: number;
  readonly gmv: number;
  readonly conversationCount: number;
  readonly newCustomerCount: number;
}

export interface MobileOverviewData {
  readonly metrics: MobileOverviewMetrics;
  readonly compare: MobileOverviewCompare | null;
}

/* --------------------------- inventory 段 ---------------------------- */

export interface MobileLowStockItem {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly stockQuantity: number | null;
  readonly stockStatus: string | null;
}

export interface MobileOutOfStockItem {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
}

export interface MobileInventoryData {
  readonly threshold: number;
  readonly lowStock: readonly MobileLowStockItem[];
  readonly outOfStock: readonly MobileOutOfStockItem[];
  readonly lowStockTotal: number;
}

/* ------------------------------ /m/home ------------------------------ */

export type MobileHomeSectionName = 'overview' | 'inventory' | 'alerts' | 'trend';

export interface MobileHomeResponse {
  readonly asOf: string;
  /** 概览时间范围（跟随 overview 段）。 */
  readonly timeRange: MobileTimeRange | null;
  readonly overview: MobileOverviewData | null;
  readonly inventory: MobileInventoryData | null;
  /**
   * 本阶段首屏**不请求** alerts / trend（扇出更大），保留字段以便后续按需加载。
   * 类型保持 unknown：当前不作为渲染依据，避免猜测字段。
   */
  readonly alerts: unknown;
  readonly trend: unknown;
  readonly sources: readonly MobileSourceFact[];
  readonly warnings: readonly string[];
  readonly degraded: boolean;
  readonly sections: Readonly<Partial<Record<MobileHomeSectionName, MobileSectionMeta>>>;
}

/**
 * 首屏默认段落：仅 overview + inventory。
 * 依据 MOBILE-04 指令 §8/§9：不为「看起来完整」把 alerts / trend 一起拉上来。
 */
export const MOBILE_HOME_FIRST_PAINT_SECTIONS: readonly MobileHomeSectionName[] = [
  'overview',
  'inventory',
];

export async function fetchHome(
  sections: readonly MobileHomeSectionName[] = MOBILE_HOME_FIRST_PAINT_SECTIONS,
): Promise<MobileHomeResponse> {
  const res = await api.get<MobileHomeResponse>('/m/home', {
    params: sections.length > 0 ? { sections: sections.join(',') } : undefined,
  });
  return res.data;
}

/* ----------------------------- /m/orders ----------------------------- */

/**
 * 订单列表项（真实契约来源：apps/api/src/agent/tools/search-orders.tool.ts 的 projected 构造）。
 *
 * 重要（与后端一致，不猜测）：
 *   - 客户名由服务端**已脱敏**（customerNameMasked），本端不再处理 PII
 *   - **没有商品明细字段**：订单行不含 items/商品摘要 → 列表不展示商品信息
 *   - amount / currency **按角色裁剪**：CUSTOMER_SERVICE 不含这两个字段；
 *     缺失表示"不可见"，**不得用 0 代替**
 *   - 无订单详情端点（/m/orders/:id 不存在）→ 本端不提供详情跳转
 */
export interface MobileOrderItem {
  readonly orderNo: string;
  readonly status: string;
  readonly customerId: string | null;
  readonly customerNameMasked: string;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly amount?: number;
  readonly currency?: string;
}

export interface MobileOrdersResponse {
  readonly asOf: string;
  readonly available: boolean;
  readonly error: string | null;
  readonly items: readonly MobileOrderItem[];
  readonly total: number | null;
  readonly page: number;
  readonly limit: number;
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
  readonly rangeHint?: string;
}

export interface MobileOrdersQuery {
  readonly status?: string;
  readonly page?: number;
  readonly limit?: number;
  /** YYYY-MM-DD（服务端 DTO 正则校验）。 */
  readonly from?: string;
  readonly to?: string;
  readonly orderNo?: string;
  readonly keyword?: string;
}

export async function fetchOrders(params: MobileOrdersQuery): Promise<MobileOrdersResponse> {
  const res = await api.get<MobileOrdersResponse>('/m/orders', { params });
  return res.data;
}

/* ---------------------------- /m/inventory --------------------------- */

export interface MobileInventoryResponse {
  readonly asOf: string;
  readonly available: boolean;
  readonly error: string | null;
  readonly threshold: number;
  readonly lowStock: readonly MobileLowStockItem[];
  readonly outOfStock: readonly MobileOutOfStockItem[];
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
}

export async function fetchInventory(params?: {
  threshold?: number;
  limit?: number;
}): Promise<MobileInventoryResponse> {
  const res = await api.get<MobileInventoryResponse>('/m/inventory', { params });
  return res.data;
}

/* ------------------------------ /m/alerts ---------------------------- */

export interface MobileAlertsResponse {
  readonly asOf: string;
  readonly available: boolean;
  readonly error: string | null;
  readonly alerts: unknown;
  readonly handoffPendingCount: number | null;
  readonly unreadCount: number | null;
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
  readonly cached: boolean;
}

export async function fetchAlerts(params?: {
  types?: readonly string[];
  limitPerType?: number;
}): Promise<MobileAlertsResponse> {
  const res = await api.get<MobileAlertsResponse>('/m/alerts', {
    params: params ? { types: params.types?.join(','), limitPerType: params.limitPerType } : undefined,
  });
  return res.data;
}

/* ---------------------------- agent ask ------------------------------ */

/**
 * PHASE MOBILE-04 — POST /agent/ask 契约（类型来源：apps/api/src/agent/agent.types.ts，
 * 与 controller/DTO 逐字核对，未猜测字段）。
 *
 * 安全：
 *   - 请求体**只**允许 { message }（服务端 DTO 为 message 1~2000 字，且全局
 *     ValidationPipe(whitelist + forbidNonWhitelisted) 对 tenantId/userId/role 等额外字段直接 400）
 *   - tenantId / userId / role 全部由服务端从 JWT 解析（JwtAuthGuard + TenantGuard）
 */
export interface AgentFact {
  readonly label: string;
  readonly value: string;
  readonly tool: string;
  readonly unit?: string;
  readonly delta?: string;
}

export interface AgentSourceFact {
  readonly tool: string;
  readonly asOf: string;
  readonly timeRange?: string | null;
  readonly rowCount?: number;
}

export interface AgentLink {
  readonly label: string;
  readonly href: string;
}

export interface AgentAnswerMeta {
  readonly elapsedMs: number;
  readonly tools: readonly string[];
  readonly cached: boolean;
  /** 降级标记：true 表示部分数据/解读不可用（事实仍然真实）。 */
  readonly degraded: boolean;
  readonly fastPath: boolean;
  readonly planLlmCalls: number;
  readonly analysisLlmCalls: number;
  readonly provider?: string;
  readonly model?: string;
}

export interface AgentAnswer {
  readonly answer: string;
  readonly summary: string;
  readonly facts: readonly AgentFact[];
  readonly sources: readonly AgentSourceFact[];
  /** 统计时间范围（服务端已格式化的字符串，形如 "from~to"）。 */
  readonly timeRange: string;
  readonly links: readonly AgentLink[];
  readonly warnings: readonly string[];
  readonly meta: AgentAnswerMeta;
}

/** Agent 请求体：**仅 message**。 */
export interface AgentAskBody {
  readonly message: string;
}

export async function askAgent(message: string): Promise<AgentAnswer> {
  const body: AgentAskBody = { message };
  const res = await api.post<AgentAnswer>('/agent/ask', body);
  return res.data;
}

/* ------------------------------ /products ---------------------------- */

/**
 * 商品列表（**直接复用既有 GET /products**，非 Mobile BFF 端点）。
 *
 * 审计结论（PHASE MOBILE-05，只读核对 apps/api/src/products/*）：
 *   · 鉴权与 Mobile 相同：@UseGuards(JwtAuthGuard, TenantGuard)；tenantId 只来自 JWT  ✅
 *   · 服务端 findMany({ where: { tenantId } }) —— 无分页 / 无搜索 / 无 isDeleted 过滤
 *   · 返回的是 **Prisma 整行**（含 price / regularPrice / salePrice / sourceConnectionId 等）
 *
 * 因此本端采取**白名单消费**：只声明并读取下方 7 个非敏感字段，
 * 价格类字段（price/regularPrice/salePrice）**一律不读取、不渲染**；
 * isDeleted 由本端过滤（避免把已删除商品展示给商家）。
 * 完整 BFF（/m/products：分页 + 字段白名单 + 角色掩码）建议见本阶段报告的只读设计。
 */
export interface MobileProductRow {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly status: string;
  readonly stockStatus: string | null;
  readonly stockQuantity: number | null;
  readonly isDeleted: boolean;
}

export async function fetchProducts(): Promise<readonly MobileProductRow[]> {
  const res = await api.get<readonly MobileProductRow[]>('/products');
  return Array.isArray(res.data) ? res.data : [];
}

/* ------------------------------- login ------------------------------- */

export interface LoginResponse {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name?: string | null;
    readonly tenantId: string;
    readonly role: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', { email, password });
  return res.data;
}
