/**
 * T2.3 — Alipay Provider Skeleton.
 *
 * DOMAIN → PROVIDER ADAPTER boundary only.
 * NO Alipay SDK, NO RSA2, NO HTTP, NO real payment/refund/signature ops.
 *
 * All business methods fail safely with PaymentError.notImplemented().
 */
import { Injectable } from '@nestjs/common';
import {
  PaymentFeature,
  PaymentProvider,
  ProviderConfig,
} from '../payment-provider.interface';
import { PaymentError } from '../../domain/payment.errors';
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

/** Alipay strongly-typed config, constructor-injected (never read from process.env). */
export interface AlipayProviderConfig extends ProviderConfig {
  readonly provider: 'alipay';
  readonly appId?: string;
  readonly gateway?: string;
}

@Injectable()
export class AlipayProvider implements PaymentProvider {
  readonly name = 'alipay';
  readonly displayName = 'Alipay';

  /**
   * Design-level capability declaration only (frozen PaymentFeature).
   * supports() never triggers a real payment request.
   */
  private readonly supportedFeatures = new Set<PaymentFeature>([
    PaymentFeature.QUERY_ORDER,
    PaymentFeature.QUERY_REFUND,
    PaymentFeature.CLOSE_ORDER,
    PaymentFeature.WEBHOOK_VERIFY,
    PaymentFeature.REFUND,
    PaymentFeature.PARTIAL_REFUND,
    PaymentFeature.BALANCE_QUERY,
    PaymentFeature.APP_PAY,
    PaymentFeature.JSAPI,
    PaymentFeature.NATIVE,
    PaymentFeature.H5,
  ]);

  constructor(readonly config: AlipayProviderConfig) {}

  supports(feature: PaymentFeature): boolean {
    return this.supportedFeatures.has(feature);
  }

  async createOrder(_params: CreateOrderParams): Promise<CreateOrderResult> {
    throw PaymentError.notImplemented(this.name, 'createOrder');
  }

  async queryOrder(_q: OrderQuery): Promise<OrderStatusResult> {
    throw PaymentError.notImplemented(this.name, 'queryOrder');
  }

  async closeOrder(_q: OrderQuery): Promise<CloseOrderResult> {
    throw PaymentError.notImplemented(this.name, 'closeOrder');
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    throw PaymentError.notImplemented(this.name, 'refund');
  }

  async queryRefund(_q: RefundQuery): Promise<RefundStatusResult> {
    throw PaymentError.notImplemented(this.name, 'queryRefund');
  }

  async verifyWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<WebhookVerification> {
    throw PaymentError.notImplemented(this.name, 'verifyWebhook');
  }

  async parseWebhook(_rawBody: Buffer): Promise<RawWebhookPayload> {
    throw PaymentError.notImplemented(this.name, 'parseWebhook');
  }

  async normalize(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent> {
    throw PaymentError.notImplemented(this.name, 'normalize');
  }

  async healthCheck(): Promise<ProviderHealth> {
    // No real channel available in the skeleton — never fake an UP status.
    return {
      status: HealthStatus.UNKNOWN,
      lastCheckedAt: new Date(),
      latencyMs: 0,
      failureCount: 0,
      successRate: 0,
      detail: 'Provider skeleton; real health check not implemented',
    };
  }
}
