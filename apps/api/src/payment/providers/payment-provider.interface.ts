/**
 * T2.3 — Payment Provider Adapter Boundary (Design Freeze v1)
 *
 * This file is the frozen contract between the payment domain and every
 * payment provider adapter (WeChat Pay / Alipay / Stripe).
 *
 * BOUNDARY RULE:
 *   - Providers internally MAY use SDKs, HTTP clients, signatures, channel
 *     error codes and channel payloads.
 *   - Outside the boundary (PaymentProvider interface, PaymentService,
 *     Registry, Controller) only these Payment Domain Types are visible.
 *   - No WeChat/Alipay/Stripe SDK type may appear here.
 *
 * Domain-owned types (PaymentError, PaymentErrorCode, PaymentFeature,
 * HealthStatus, ProviderHealth) live in src/payment/domain and are the
 * single source of truth — this file only re-exports them.
 *
 * DO NOT add methods to PaymentProvider (no getCapabilities(), no
 * capabilities field, no provider-specific methods).
 */
import { PaymentFeature } from '../domain/payment.enums';
import { ProviderConfig, ProviderHealth } from '../domain/payment.types';

export { PaymentFeature, HealthStatus } from '../domain/payment.enums';
export {
  ProviderConfig,
  ProviderHealth,
  ProviderRetryConfig,
  ProviderCircuitBreakerConfig,
  ProviderWebhookConfig,
} from '../domain/payment.types';
export { PaymentError, PaymentErrorCode } from '../domain/payment.errors';

/* ------------------------------------------------------------------ */
/* Order lifecycle domain types                                        */
/* ------------------------------------------------------------------ */

export interface CreateOrderParams {
  /** Our ledger order id. */
  readonly orderId: string;
  readonly tenantId: string;
  readonly plan: string;
  /** Amount in minor units (cents / fen). */
  readonly amount: number;
  /** ISO 4217 currency code. */
  readonly currency: string;
  readonly description?: string;
  readonly idempotencyKey?: string;
  readonly notifyUrl?: string;
  readonly returnUrl?: string;
}

export type OrderStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'CLOSED'
  | 'FAILED'
  | 'UNKNOWN';

export interface CreateOrderResult {
  readonly orderId: string;
  /** Channel-side order reference (e.g. prepay_id / trade_no / payment_intent). */
  readonly providerOrderId: string;
  /** Hosted payment URL or QR-code content, when applicable. */
  readonly paymentUrl: string | null;
  readonly amount: number;
  readonly currency: string;
  readonly status: OrderStatus;
}

export interface OrderQuery {
  readonly orderId: string;
  readonly providerOrderId?: string;
}

export interface OrderStatusResult {
  readonly orderId: string;
  readonly providerOrderId?: string;
  readonly status: OrderStatus;
  readonly paidAt?: Date;
}

export interface CloseOrderResult {
  readonly orderId: string;
  readonly providerOrderId?: string;
  readonly closed: boolean;
}

/* ------------------------------------------------------------------ */
/* Refund domain types                                                 */
/* ------------------------------------------------------------------ */

export interface RefundParams {
  readonly orderId: string;
  /** Our refund reference. */
  readonly refundId: string;
  readonly providerOrderId?: string;
  readonly amount: number;
  readonly currency: string;
  readonly reason?: string;
}

export type RefundStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface RefundResult {
  readonly refundId: string;
  readonly providerRefundId: string;
  readonly status: RefundStatus;
}

export interface RefundQuery {
  readonly refundId: string;
  readonly providerRefundId?: string;
}

export interface RefundStatusResult {
  readonly refundId: string;
  readonly providerRefundId?: string;
  readonly status: RefundStatus;
}

/* ------------------------------------------------------------------ */
/* Webhook domain types                                                */
/* ------------------------------------------------------------------ */

export interface WebhookVerification {
  readonly valid: boolean;
  readonly provider: string;
  readonly reason?: string;
}

export interface RawWebhookPayload {
  readonly provider: string;
  /** Channel-specific payload, kept opaque at the boundary. */
  readonly raw: unknown;
  readonly receivedAt: Date;
}

export type NormalizedEventType =
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_CLOSED'
  | 'REFUND_SUCCEEDED'
  | 'REFUND_FAILED'
  | 'UNKNOWN';

export interface NormalizedPaymentEvent {
  readonly provider: string;
  readonly eventType: NormalizedEventType;
  readonly orderId?: string;
  readonly providerOrderId?: string;
  readonly refundId?: string;
  readonly providerRefundId?: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly occurredAt?: Date;
}

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/**
 * ProviderConfig lives in src/payment/domain/payment.types.ts (single
 * source of truth). Re-exported here for adapter-boundary convenience —
 * never redefined.
 */

/**
 * FROZEN PaymentProvider contract (Design Freeze v1).
 * Do not extend: no getCapabilities(), no capabilities field,
 * no provider-specific methods.
 */
export interface PaymentProvider {
  readonly name: string;
  readonly displayName: string;

  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  queryOrder(q: OrderQuery): Promise<OrderStatusResult>;
  closeOrder(q: OrderQuery): Promise<CloseOrderResult>;
  refund(p: RefundParams): Promise<RefundResult>;
  queryRefund(q: RefundQuery): Promise<RefundStatusResult>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<WebhookVerification>;
  parseWebhook(rawBody: Buffer): Promise<RawWebhookPayload>;
  normalize(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent>;
  healthCheck(): Promise<ProviderHealth>;

  supports(feature: PaymentFeature): boolean;

  readonly config: ProviderConfig;
}
