/**
 * T2.9+ — Aggregate Payment Provider (MaPay/码支付 real adapter).
 *
 * Implements the official MaPay contract (docs: https://mzf.mapay.cc/doc):
 *   - createOrder  → POST /xpay/epay/mapi.php (API pay, returns payurl/qrcode)
 *   - queryOrder   → GET  /xpay/epay/api.php?act=order
 *   - verifyWebhook→ MD5 sign verification (official rule)
 *   - parseWebhook → parse form/json callback payload
 *   - normalize    → NormalizedPaymentEvent
 *
 * DOMAIN → PROVIDER ADAPTER boundary. Amounts arrive in minor units and are
 * converted to yuan (string, 2dp) here — the adapter owns the external format.
 * Secrets come from injected config (env), never hardcoded / persisted.
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
import { signParams, verifySign } from './mapay.signature';
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

/** Aggregate (MaPay) strongly-typed config, constructor-injected (never read from process.env). */
export interface AggregatePaymentProviderConfig extends ProviderConfig {
  readonly provider: 'aggregate';
  /** Platform merchant id (PID). */
  readonly merchantId?: string;
  /** Platform merchant key (KEY) — secret, injected, never persisted. */
  readonly apiKey?: string;
  /** API base URL, e.g. https://mzf.mapay.cc/xpay/epay */
  readonly gatewayUrl?: string;
  /** Default pay type: alipay | wxpay | qqpay | bank | jdpay | paypal. */
  readonly payType?: string;
  /** Public callback URL for platform notifications. */
  readonly notifyUrl?: string;
}

interface MaPayApiResponse {
  code: number;
  msg: string;
  trade_no?: string;
  out_trade_no?: string;
  payurl?: string;
  qrcode?: string;
  urlscheme?: string;
  money?: string;
  status?: number | string;
  [k: string]: unknown;
}

@Injectable()
export class AggregatePaymentProvider implements PaymentProvider {
  readonly name = 'aggregate';
  readonly displayName = 'Aggregate Payment';

  private readonly supportedFeatures = new Set<PaymentFeature>([
    PaymentFeature.QUERY_ORDER,
    PaymentFeature.QUERY_REFUND,
    PaymentFeature.CLOSE_ORDER,
    PaymentFeature.WEBHOOK_VERIFY,
    PaymentFeature.REFUND,
  ]);

  constructor(readonly config: AggregatePaymentProviderConfig) {}

  supports(feature: PaymentFeature): boolean {
    return this.supportedFeatures.has(feature);
  }

  /* ------------------------------------------------------------------ */
  /* createOrder — POST /xpay/epay/mapi.php                              */
  /* ------------------------------------------------------------------ */

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    const base = this.gateway();
    const payload: Record<string, string> = {
      pid: this.config.merchantId ?? '',
      type: this.config.payType ?? 'alipay',
      out_trade_no: params.orderId,
      notify_url: this.config.notifyUrl ?? '',
      return_url: this.config.notifyUrl ?? '',
      name: params.plan,
      money: this.toYuan(params.amount),
    };
    payload.sign = signParams(payload, this.key());
    payload.sign_type = 'MD5';

    // Use the PAGE-JUMP endpoint (submit.php): it 302-redirects to the real
    // cashier page /pay/<trade_no> which shows the amount and pay button.
    // (mapi.php only returns a merchant FIXED收款码 — no amount, no cashier.)
    const res = await fetch(`${base}/submit.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload).toString(),
      redirect: 'manual',
    });
    // Follow the 302 to the cashier URL (3xx with location = success).
    const location = res.headers.get('location');
    if (location) {
      const host = new URL(base).origin;
      const paymentUrl = location.startsWith('http') ? location : `${host}${location}`;
      return {
        orderId: params.orderId,
        providerOrderId: params.orderId, // trade_no is on the cashier page itself
        paymentUrl,
        amount: params.amount,
        currency: params.currency,
        status: 'PENDING',
      };
    }
    if (!res.ok) {
      throw new PaymentError(`MaPay createOrder HTTP ${res.status}`, {
        code: PaymentErrorCode.PROVIDER_ERROR,
        provider: this.name,
        retryable: true,
      });
    }
    // No redirect and no 3xx: parse the (JSON) error body.
    const text = await res.text().catch(() => '');
    const err = this.parseErrorBody(text);
    throw new PaymentError(`MaPay createOrder failed: ${err?.msg ?? 'no redirect'}`, {
      code: PaymentErrorCode.PROVIDER_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  private parseErrorBody(text: string): { code?: number; msg?: string } | undefined {
    try {
      return JSON.parse(text) as { code?: number; msg?: string };
    } catch {
      return undefined;
    }
  }

  /* ------------------------------------------------------------------ */
  /* queryOrder — GET /xpay/epay/api.php?act=order                       */
  /* ------------------------------------------------------------------ */

  async queryOrder(q: OrderQuery): Promise<OrderStatusResult> {
    const base = this.gateway();
    const url = `${base}/api.php?act=order&pid=${encodeURIComponent(
      this.config.merchantId ?? '',
    )}&key=${encodeURIComponent(this.key())}&out_trade_no=${encodeURIComponent(q.orderId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new PaymentError(`MaPay queryOrder HTTP ${res.status}`, {
        code: PaymentErrorCode.PROVIDER_ERROR,
        provider: this.name,
        retryable: true,
      });
    }
    const data = (await res.json()) as MaPayApiResponse;
    if (data.code !== 1) {
      throw new PaymentError(`MaPay queryOrder failed: ${data.msg ?? 'unknown'}`, {
        code: PaymentErrorCode.PROVIDER_ERROR,
        provider: this.name,
        retryable: false,
      });
    }
    const paid = String(data.status) === '1';
    return {
      orderId: q.orderId,
      providerOrderId: data.trade_no,
      status: paid ? 'PAID' : 'PENDING',
      paidAt: paid ? new Date() : undefined,
    };
  }

  /* ------------------------------------------------------------------ */
  /* closeOrder / refund — MaPay contract has no close/refund endpoints. */
  /* ------------------------------------------------------------------ */

  async closeOrder(_q: OrderQuery): Promise<CloseOrderResult> {
    throw new PaymentError('MaPay does not expose a close-order endpoint', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  async refund(_p: RefundParams): Promise<RefundResult> {
    throw new PaymentError('MaPay does not expose a refund endpoint yet', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  async queryRefund(_q: RefundQuery): Promise<RefundStatusResult> {
    throw new PaymentError('MaPay does not expose a refund endpoint yet', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: this.name,
      retryable: false,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Webhook: verify → parse → normalize                                 */
  /* ------------------------------------------------------------------ */

  async verifyWebhook(
    _rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<WebhookVerification> {
    const parsed = await this.parseWebhook(_rawBody);
    const params = parsed.raw as Record<string, string>;
    const sign = params['sign'];
    const valid = verifySign(params, this.key(), sign);
    return {
      valid,
      provider: this.name,
      reason: valid ? undefined : 'MaPay sign verification failed',
    };
  }

  async parseWebhook(rawBody: Buffer): Promise<RawWebhookPayload> {
    const text = rawBody.toString('utf8');
    let raw: Record<string, string> = {};
    try {
      const json = JSON.parse(text) as Record<string, unknown>;
      raw = Object.fromEntries(
        Object.entries(json).map(([k, v]) => [k, String(v ?? '')]),
      );
    } catch {
      // form-urlencoded
      for (const [k, v] of new URLSearchParams(text)) {
        raw[k] = v;
      }
    }
    return {
      provider: this.name,
      raw,
      receivedAt: new Date(),
    };
  }

  async normalize(
    rawBody: Buffer,
    _headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent> {
    const parsed = await this.parseWebhook(rawBody);
    const p = parsed.raw as Record<string, string>;
    const success = p['trade_status'] === 'TRADE_SUCCESS';
    return {
      provider: this.name,
      eventType: success ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
      orderId: p['out_trade_no'],
      providerOrderId: p['trade_no'],
      amount: p['money'] ? Math.round(parseFloat(p['money']) * 100) : undefined,
      currency: 'CNY',
      occurredAt: new Date(),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Health                                                              */
  /* ------------------------------------------------------------------ */

  async healthCheck(): Promise<ProviderHealth> {
    const configured =
      !!this.config.merchantId && !!this.config.apiKey && !!this.config.gatewayUrl;
    return {
      status: configured ? HealthStatus.UNKNOWN : HealthStatus.DOWN,
      lastCheckedAt: new Date(),
      latencyMs: 0,
      failureCount: 0,
      successRate: 0,
      detail: configured
        ? 'MaPay configured; real health check pending channel enablement'
        : 'MaPay not configured',
    };
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  private gateway(): string {
    return (this.config.gatewayUrl ?? '').replace(/\/$/, '');
  }

  private key(): string {
    if (!this.config.apiKey) {
      throw new PaymentError('MaPay apiKey is not configured', {
        code: PaymentErrorCode.PROVIDER_NOT_AVAILABLE,
        provider: this.name,
        retryable: false,
      });
    }
    return this.config.apiKey;
  }

  /** minor units (int) → yuan string with 2 decimals, e.g. 9900 → "99.00". */
  private toYuan(minorUnits: number): string {
    return (minorUnits / 100).toFixed(2);
  }
}
