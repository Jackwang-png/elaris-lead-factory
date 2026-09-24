/**
 * T2.4 — UnknownPaymentProvider (fallback, never participates in routing).
 *
 * Returned by PaymentProviderRegistry.get() when a provider key is not
 * registered. All operations fail safely with a structured PaymentError —
 * this provider never touches a real PSP.
 */
import { Injectable } from '@nestjs/common';
import {
  PaymentFeature,
  PaymentProvider,
  ProviderConfig,
} from './payment-provider.interface';
import { PaymentError } from '../domain/payment.errors';
import { HealthStatus } from '../domain/payment.enums';
import { ProviderHealth } from '../domain/payment.types';
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
} from './payment-provider.interface';

@Injectable()
export class UnknownPaymentProvider implements PaymentProvider {
  readonly name = 'unknown';
  readonly displayName = 'Unknown Payment Provider';

  private readonly supportedFeatures = new Set<PaymentFeature>([]);

  constructor(readonly config: ProviderConfig) {}

  supports(feature: PaymentFeature): boolean {
    return this.supportedFeatures.has(feature);
  }

  async createOrder(_params: CreateOrderParams): Promise<CreateOrderResult> {
    throw PaymentError.providerNotAvailable(this.name, 'createOrder');
  }

  async queryOrder(_q: OrderQuery): Promise<OrderStatusResult> {
    throw PaymentError.providerNotAvailable(this.name, 'queryOrder');
  }

  async closeOrder(_q: OrderQuery): Promise<CloseOrderResult> {
    throw PaymentError.providerNotAvailable(this.name, 'closeOrder');
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    throw PaymentError.providerNotAvailable(this.name, 'refund');
  }

  async queryRefund(_q: RefundQuery): Promise<RefundStatusResult> {
    throw PaymentError.providerNotAvailable(this.name, 'queryRefund');
  }

  async verifyWebhook(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<WebhookVerification> {
    throw PaymentError.providerNotAvailable(this.name, 'verifyWebhook');
  }

  async parseWebhook(_rawBody: Buffer): Promise<RawWebhookPayload> {
    throw PaymentError.providerNotAvailable(this.name, 'parseWebhook');
  }

  async normalize(
    _rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent> {
    throw PaymentError.providerNotAvailable(this.name, 'normalize');
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      status: HealthStatus.UNKNOWN,
      lastCheckedAt: new Date(),
      latencyMs: 0,
      failureCount: 0,
      successRate: 0,
      detail: 'Unknown provider; key is not registered',
    };
  }
}
