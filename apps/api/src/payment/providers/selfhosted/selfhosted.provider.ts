/**
 * T2.10 — SelfHosted QR Payment Provider.
 *
 * The merchant uploads their OWN personal collection QR (Alipay / WeChat).
 * There is NO external payment platform involved:
 *   - createOrder  → returns OUR cashier page URL (shows amount + QR image)
 *   - payment flow → customer scans the QR, pays manually (enters amount)
 *   - confirmation → customer clicks "I have paid" → order becomes
 *                    AWAITING_CONFIRM → admin confirms → subscription ACTIVE
 *
 * No HTTP calls, no SDK, no secrets beyond the injected config.
 * Amounts arrive in minor units; the cashier page shows yuan.
 */
import { Injectable } from '@nestjs/common';
import {
  PaymentFeature,
  PaymentProvider,
  ProviderConfig,
} from '../payment-provider.interface';
import { PaymentError, PaymentErrorCode } from '../../domain/payment.errors';
import { HealthStatus } from '../../domain/payment.enums';
import { ProviderHealth } from '../../domain/payment.types';
import type {
  CloseOrderResult,
  CreateOrderParams,
  CreateOrderResult,
  NormalizedPaymentEvent,
  OrderQuery,
  OrderStatusResult,
  RawWebhookPayload,
  RefundParams,
  RefundQuery,
  RefundResult,
  RefundStatusResult,
  WebhookVerification,
} from '../payment-provider.interface';

/** SelfHosted strongly-typed config, constructor-injected (never read from process.env). */
export interface SelfHostedProviderConfig extends ProviderConfig {
  readonly provider: 'selfhosted';
  /** Public base URL of the cashier page, e.g. https://api.wan-wan.xyz */
  readonly cashierBaseUrl?: string;
  /** Default channel: alipay | wechat (which QR to show). */
  readonly qrChannel?: string;
}

@Injectable()
export class SelfHostedPaymentProvider implements PaymentProvider {
  readonly name = 'selfhosted';
  readonly displayName = 'Self-Hosted QR';

  private readonly supportedFeatures = new Set<PaymentFeature>([
    PaymentFeature.QUERY_ORDER,
  ]);

  constructor(readonly config: SelfHostedProviderConfig) {}

  supports(feature: PaymentFeature): boolean {
    return this.supportedFeatures.has(feature);
  }

  /* ------------------------------------------------------------------ */
  /* createOrder — return OUR cashier page URL (no external platform)    */
  /* ------------------------------------------------------------------ */

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const base = (this.config.cashierBaseUrl ?? '').replace(/\/$/, '');
    if (!base) {
      throw new PaymentError('SelfHosted cashierBaseUrl is not configured', {
        code: PaymentErrorCode.PROVIDER_NOT_AVAILABLE,
        provider: this.name,
        retryable: false,
      });
    }
    const channel = this.config.qrChannel ?? 'alipay';
    return {
      orderId: params.orderId,
      providerOrderId: params.orderId, // local channel — our order id IS the reference
      paymentUrl: `${base}/payment/cashier/${params.orderId}?channel=${channel}`,
      amount: params.amount,
      currency: params.currency,
      status: 'PENDING',
    };
  }

  /* ------------------------------------------------------------------ */
  /* queryOrder — local channel; status is resolved by PaymentService.    */
  /* ------------------------------------------------------------------ */

  async queryOrder(q: OrderQuery): Promise<OrderStatusResult> {
    // No external state to query: the ledger (PaymentService) is authoritative.
    // Return UNKNOWN so callers fall back to the local order record.
    return {
      orderId: q.orderId,
      providerOrderId: q.providerOrderId,
      status: 'UNKNOWN',
    };
  }

  /* ------------------------------------------------------------------ */
  /* closeOrder / refund — not supported (manual channel).               */
  /* ------------------------------------------------------------------ */

  async closeOrder(_q: OrderQuery): Promise<CloseOrderResult> {
    throw new PaymentError('SelfHosted channel has no close-order endpoint', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    throw new PaymentError('SelfHosted channel has no refund endpoint', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  async queryRefund(_q: RefundQuery): Promise<RefundStatusResult> {
    throw new PaymentError('SelfHosted channel has no refund endpoint', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Webhook — not applicable (confirmation goes through our own API).   */
  /* ------------------------------------------------------------------ */

  async verifyWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<WebhookVerification> {
    return { valid: false, provider: this.name, reason: 'no external webhook' };
  }

  async parseWebhook(rawBody: Buffer): Promise<RawWebhookPayload> {
    return {
      provider: this.name,
      raw: { body: rawBody.toString('utf8') },
      receivedAt: new Date(),
    };
  }

  async normalize(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent> {
    return {
      provider: this.name,
      eventType: 'UNKNOWN',
    };
  }

  /* ------------------------------------------------------------------ */
  /* Health                                                              */
  /* ------------------------------------------------------------------ */

  async healthCheck(): Promise<ProviderHealth> {
    const configured = !!this.config.cashierBaseUrl;
    return {
      status: configured ? HealthStatus.UP : HealthStatus.DOWN,
      lastCheckedAt: new Date(),
      latencyMs: 0,
      failureCount: 0,
      successRate: 0,
      detail: configured
        ? 'SelfHosted QR channel ready'
        : 'SelfHosted cashierBaseUrl not configured',
    };
  }
}
