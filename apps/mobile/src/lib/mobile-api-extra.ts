/**
 * PHASE MOBILE-06 — Mobile BFF 新增只读端点的客户端契约。
 *
 * 类型来源（与后端逐字核对，不猜测）：
 *   apps/api/src/mobile/mobile-extra.types.ts（客户 / 订单详情 / 待人工 / 通知 / 商品）
 *   apps/api/src/mobile/dto/mobile-queries.dto.ts（分页与筛选参数边界）
 *
 * 安全：
 *   · 全部 GET；tenantId/userId/role 由服务端从 JWT 解析，客户端零传参
 *   · PII 字段已由服务端脱敏（nameMasked / phoneMasked / emailMasked）
 *   · 金额字段缺失 = 该角色不可见（≠0），UI 必须显示「金额不可见」
 */

import { api } from './api';
import type { MobileOrderItem } from './mobile-api';

/* ------------------------------ 客户 ------------------------------ */

export interface MobileCustomerListItem {
  readonly id: string;
  readonly nameMasked: string;
  readonly phoneMasked: string | null;
  readonly emailMasked: string | null;
  readonly status: string;
  readonly stage: string | null;
  readonly tags: readonly string[];
  readonly source: string;
  readonly lastContactAt: string | null;
  readonly createdAt: string;
  readonly orderCount: number;
  readonly lastOrderAt: string | null;
}

export interface MobileCustomersResponse {
  readonly asOf: string;
  readonly available: boolean;
  readonly error: string | null;
  readonly items: readonly MobileCustomerListItem[];
  readonly total: number | null;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly warnings: readonly string[];
}

export interface MobileCustomerDetail extends MobileCustomerListItem {
  readonly conversationCount: number;
  readonly lastOrderAmount: number | null;
  readonly lastOrderCurrency: string | null;
  readonly pendingHandoffCount: number;
}

/* ---------------------------- 订单详情 ---------------------------- */

export interface MobileOrderDetailItem {
  readonly name: string;
  readonly sku: string | null;
  readonly quantity: number | null;
  readonly price: number | null;
  readonly total: number | null;
  readonly imageUrl: string | null;
}

export interface MobileOrderDetailResponse {
  readonly asOf: string;
  readonly available: boolean;
  readonly error: string | null;
  readonly id: string;
  readonly orderNo: string;
  readonly status: string;
  readonly customerId: string | null;
  readonly customerNameMasked: string;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly itemCount: number;
  readonly items: readonly MobileOrderDetailItem[];
  readonly warnings: readonly string[];
}

/* --------------------------- 待人工接待 --------------------------- */

export interface MobileHandoffItem {
  readonly conversationId: string;
  readonly channel: string;
  readonly customerId: string | null;
  readonly customerNameMasked: string;
  readonly handoffReason: string | null;
  readonly handoffAt: string | null;
  readonly lastMessagePreview: string | null;
  readonly lastMessageSender: string | null;
  readonly lastMessageAt: string | null;
}

export interface MobileHandoffResponse {
  readonly asOf: string;
  readonly available: boolean;
  readonly error: string | null;
  readonly items: readonly MobileHandoffItem[];
  readonly total: number | null;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly warnings: readonly string[];
}

/* ------------------------------ 通知 ------------------------------ */

export interface MobileNotificationItem {
  readonly id: string;
  readonly title: string;
  readonly resource: string;
  readonly success: boolean;
  readonly createdAt: string;
}

export interface MobileNotificationsResponse {
  readonly asOf: string;
  readonly items: readonly MobileNotificationItem[];
  readonly total: number | null;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly recent24hCount: number;
  readonly warnings: readonly string[];
}

/* ------------------------------ 商品 ------------------------------ */

export interface MobileProductItem {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly status: string;
  readonly stockStatus: string | null;
  readonly stockQuantity: number | null;
  readonly price: number | null;
  readonly updatedAt: string;
}

export interface MobileProductsResponse {
  readonly asOf: string;
  readonly items: readonly MobileProductItem[];
  readonly total: number | null;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly warnings: readonly string[];
}

/* ---------------------------- 调用封装 ---------------------------- */

export async function fetchCustomers(params: {
  page?: number;
  limit?: number;
  keyword?: string;
}): Promise<MobileCustomersResponse> {
  const res = await api.get<MobileCustomersResponse>('/m/customers', { params });
  return res.data;
}

export async function fetchCustomer(id: string): Promise<MobileCustomerDetail> {
  const res = await api.get<MobileCustomerDetail>(`/m/customers/${encodeURIComponent(id)}`);
  return res.data;
}

export async function fetchCustomerOrders(
  id: string,
  params: { page?: number; limit?: number; status?: string; from?: string; to?: string },
): Promise<{
  readonly asOf: string;
  readonly items: readonly MobileOrderItem[];
  readonly total: number | null;
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
  readonly warnings: readonly string[];
}> {
  const res = await api.get(`/m/customers/${encodeURIComponent(id)}/orders`, { params });
  return res.data;
}

/** key 支持订单号或内部 id（服务端两者都接受，且强制租户约束）。 */
export async function fetchOrderDetail(key: string): Promise<MobileOrderDetailResponse> {
  const res = await api.get<MobileOrderDetailResponse>(`/m/orders/${encodeURIComponent(key)}`);
  return res.data;
}

export async function fetchHandoff(params: {
  page?: number;
  limit?: number;
}): Promise<MobileHandoffResponse> {
  const res = await api.get<MobileHandoffResponse>('/m/handoff', { params });
  return res.data;
}

export async function fetchNotifications(params: {
  page?: number;
  limit?: number;
}): Promise<MobileNotificationsResponse> {
  const res = await api.get<MobileNotificationsResponse>('/m/notifications', { params });
  return res.data;
}

export async function fetchMobileProducts(params: {
  page?: number;
  limit?: number;
  keyword?: string;
  status?: string;
}): Promise<MobileProductsResponse> {
  const res = await api.get<MobileProductsResponse>('/m/products', { params });
  return res.data;
}
