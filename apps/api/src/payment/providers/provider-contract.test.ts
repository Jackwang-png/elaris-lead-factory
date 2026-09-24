/**
 * T2.3 — Provider Contract Tests (minimal, fully type-safe).
 *
 * Uses Node's built-in node:test runner — no new test infrastructure.
 * Run: npx ts-node src/payment/providers/provider-contract.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentError, PaymentErrorCode } from '../domain/payment.errors';
import { HealthStatus, PaymentFeature } from '../domain/payment.enums';
import {
  CreateOrderParams,
  OrderQuery,
  PaymentProvider,
  RefundParams,
  RefundQuery,
} from './payment-provider.interface';
import { WechatPayProvider } from './wechat/wechat-pay.provider';
import { mapWechatError } from './wechat/wechat-pay.error-map';
import { AlipayProvider } from './alipay/alipay.provider';
import { mapAlipayError } from './alipay/alipay.error-map';
import { StripeProvider } from './stripe/stripe.provider';
import { mapStripeError } from './stripe/stripe.error-map';

interface ProviderEntry {
  key: string;
  displayName: string;
  provider: PaymentProvider;
  mapError: (rawCode: string, message?: string) => PaymentError;
  knownCodes: ReadonlyArray<readonly [string, PaymentErrorCode, boolean]>;
}

const createOrderParams: CreateOrderParams = {
  orderId: 'order_contract_test',
  tenantId: 'tenant_contract_test',
  plan: 'PRO',
  amount: 100,
  currency: 'CNY',
};

const orderQuery: OrderQuery = {
  orderId: 'order_contract_test',
};

const refundParams: RefundParams = {
  orderId: 'order_contract_test',
  refundId: 'refund_contract_test',
  amount: 100,
  currency: 'CNY',
};

const refundQuery: RefundQuery = {
  refundId: 'refund_contract_test',
};

const rawBody = Buffer.from('{"event":"test"}');
const headers: Record<string, string> = { 'content-type': 'application/json' };

function buildProviders(): ProviderEntry[] {
  return [
    {
      key: 'wechat',
      displayName: 'WeChat Pay',
      provider: new WechatPayProvider({
        provider: 'wechat',
        environment: 'sandbox',
        enabled: true,
      }),
      mapError: mapWechatError,
      knownCodes: [
        ['SYSTEMERROR', PaymentErrorCode.PROVIDER_ERROR, true],
        ['ORDERNOTEXIST', PaymentErrorCode.PROVIDER_ERROR, false],
        ['USERPAYING', PaymentErrorCode.RETRYABLE_ERROR, true],
        ['TRADE_STATE_ERROR', PaymentErrorCode.BUSINESS_ERROR, false],
      ],
    },
    {
      key: 'alipay',
      displayName: 'Alipay',
      provider: new AlipayProvider({
        provider: 'alipay',
        environment: 'sandbox',
        enabled: true,
      }),
      mapError: mapAlipayError,
      knownCodes: [
        ['ACQ.SYSTEM_ERROR', PaymentErrorCode.PROVIDER_ERROR, true],
        ['ACQ.TRADE_NOT_EXIST', PaymentErrorCode.PROVIDER_ERROR, false],
        ['ACQ.TRADE_STATUS_ERROR', PaymentErrorCode.BUSINESS_ERROR, false],
      ],
    },
    {
      key: 'stripe',
      displayName: 'Stripe',
      provider: new StripeProvider({
        provider: 'stripe',
        environment: 'sandbox',
        enabled: true,
      }),
      mapError: mapStripeError,
      knownCodes: [
        ['api_error', PaymentErrorCode.RETRYABLE_ERROR, true],
        ['card_error', PaymentErrorCode.BUSINESS_ERROR, false],
        ['invalid_request_error', PaymentErrorCode.BUSINESS_ERROR, false],
      ],
    },
  ];
}

for (const entry of buildProviders()) {
  const { key, displayName, provider } = entry;

  test(`${key}: name is correct`, () => {
    assert.equal(provider.name, key);
  });

  test(`${key}: displayName is correct`, () => {
    assert.equal(provider.displayName, displayName);
  });

  test(`${key}: config exists`, () => {
    assert.ok(provider.config);
    assert.equal(provider.config.provider, key);
    assert.equal(provider.config.environment, 'sandbox');
    assert.equal(provider.config.enabled, true);
  });

  test(`${key}: supports() returns boolean`, () => {
    for (const feature of Object.values(PaymentFeature)) {
      const result = provider.supports(feature);
      assert.equal(typeof result, 'boolean');
    }
  });

  test(`${key}: all PaymentProvider methods exist`, () => {
    assert.equal(typeof provider.createOrder, 'function');
    assert.equal(typeof provider.queryOrder, 'function');
    assert.equal(typeof provider.closeOrder, 'function');
    assert.equal(typeof provider.refund, 'function');
    assert.equal(typeof provider.queryRefund, 'function');
    assert.equal(typeof provider.verifyWebhook, 'function');
    assert.equal(typeof provider.parseWebhook, 'function');
    assert.equal(typeof provider.normalize, 'function');
    assert.equal(typeof provider.healthCheck, 'function');
    assert.equal(typeof provider.supports, 'function');
  });

  test(`${key}: unimplemented business methods throw PaymentError`, async () => {
    const cases: Array<() => Promise<unknown>> = [
      () => provider.createOrder(createOrderParams),
      () => provider.queryOrder(orderQuery),
      () => provider.closeOrder(orderQuery),
      () => provider.refund(refundParams),
      () => provider.queryRefund(refundQuery),
      () => provider.verifyWebhook(rawBody, headers),
      () => provider.parseWebhook(rawBody),
      () => provider.normalize(rawBody, headers),
    ];
    for (const call of cases) {
      await assert.rejects(
        call,
        (err: unknown) => {
          assert.ok(err instanceof PaymentError, 'must throw PaymentError');
          assert.equal(err.code, PaymentErrorCode.NOT_IMPLEMENTED);
          assert.equal(err.provider, key);
          return true;
        },
        `${key} business method must throw PaymentError.notImplemented`,
      );
    }
  });

  test(`${key}: healthCheck() returns frozen ProviderHealth without network`, async () => {
    const health = await provider.healthCheck();
    assert.ok(health);
    assert.equal(health.status, HealthStatus.UNKNOWN);
    assert.ok(health.lastCheckedAt instanceof Date);
    assert.equal(health.latencyMs, 0);
    assert.equal(health.failureCount, 0);
    assert.equal(health.successRate, 0);
    assert.match(health.detail, /skeleton/i);
  });

  test(`${key}: known channel error codes map to correct PaymentErrorCode`, () => {
    for (const [rawCode, expectedCode, expectedRetryable] of entry.knownCodes) {
      const err = entry.mapError(rawCode);
      assert.ok(err instanceof PaymentError);
      assert.equal(err.code, expectedCode);
      assert.equal(err.retryable, expectedRetryable);
      assert.equal(err.mappedFrom, rawCode);
    }
  });

  test(`${key}: unknown channel error code maps to PROVIDER_ERROR`, () => {
    const rawCode = 'UNKNOWN_CHANNEL_CODE_XYZ';
    const err = entry.mapError(rawCode);
    assert.ok(err instanceof PaymentError);
    assert.equal(err.code, PaymentErrorCode.PROVIDER_ERROR);
    assert.equal(err.retryable, false);
    assert.equal(err.mappedFrom, rawCode);
  });
}
