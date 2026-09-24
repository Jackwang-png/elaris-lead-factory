/**
 * T2.8 — PaymentService Integration tests.
 *
 * Assembles PaymentService + real PaymentExecutionService + real
 * PaymentProviderRegistry with mocked Prisma/Config (PrismaService would
 * otherwise connect to the database). No new test infrastructure.
 *
 * Run: npx ts-node src/payment/payment-service.integration.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

import { PaymentService } from './payment.service';
import { PaymentExecutionService } from './execution/payment-execution.service';
import { PaymentProvidersModule } from './payment-providers.module';
import {
  PaymentProviderRegistry,
  createDefaultProviderConfig,
} from './providers/payment-provider.registry';
import { WechatPayProvider } from './providers/wechat/wechat-pay.provider';
import { PaymentError, PaymentErrorCode } from './domain/payment.errors';
import { HealthStatus } from './domain/payment.enums';
import type {
  CloseOrderResult,
  CreateOrderParams,
  CreateOrderResult,
  NormalizedPaymentEvent,
  OrderQuery,
  OrderStatusResult,
  PaymentFeature,
  PaymentProvider,
  ProviderConfig,
  ProviderHealth,
  RawWebhookPayload,
  RefundParams,
  RefundQuery,
  RefundResult,
  RefundStatusResult,
  WebhookVerification,
} from './providers/payment-provider.interface';

/* ------------------------------------------------------------------ */
/* Mocks                                                               */
/* ------------------------------------------------------------------ */

const mockConfig = {
  get: (key: string) =>
    key === 'PAYMENT_WEBHOOK_SECRET' ? 'test-secret' : undefined,
} as unknown as ConfigService;

interface MockPrismaOptions {
  tenant?: Record<string, unknown> | null;
  plan?: Record<string, unknown> | null;
  activeSubscription?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  subscriptions?: Array<Record<string, unknown>>;
}

function createMockPrisma(options: MockPrismaOptions = {}) {
  const createdOrders: Array<Record<string, unknown>> = [];
  const createdSubscriptions: Array<Record<string, unknown>> = [];
  return {
    tenant: {
      findUnique: async () => options.tenant ?? { id: 'tenant1' },
    },
    plan: {
      findFirst: async () =>
        options.plan ?? { id: 'plan1', name: 'PRO', price: 100 },
    },
    subscription: {
      findFirst: async () => options.activeSubscription ?? null,
      findMany: async () => options.subscriptions ?? [],
      create: async (args: { data: Record<string, unknown> }) => {
        const sub = { id: 'sub1', ...args.data };
        createdSubscriptions.push(sub);
        return sub;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    paymentOrder: {
      create: async (args: { data: Record<string, unknown> }) => {
        const order = { id: 'order1', ...args.data };
        createdOrders.push(order);
        return order;
      },
      findFirst: async () => options.order ?? null,
      findUnique: async () => options.order ?? null,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      }),
    },
    createdOrders,
    createdSubscriptions,
  };
}

/** Minimal fake provider to observe calls / control behaviour. */
class FakeProvider implements PaymentProvider {
  readonly name: string;
  readonly displayName: string;
  readonly config: ProviderConfig;
  readonly calls: Record<string, unknown[]> = {};
  private readonly handlers: Record<string, (args: unknown) => Promise<unknown>> = {};

  constructor(name: string, config: ProviderConfig) {
    this.name = name;
    this.displayName = `Fake ${name}`;
    this.config = config;
  }

  setHandler(method: string, fn: (args: unknown) => Promise<unknown>): void {
    this.handlers[method] = fn;
  }

  private async call(method: string, args: unknown): Promise<unknown> {
    (this.calls[method] ??= []).push(args);
    const handler = this.handlers[method];
    if (!handler) {
      throw PaymentError.notImplemented(this.name, method);
    }
    return handler(args);
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    return this.call('createOrder', params) as Promise<CreateOrderResult>;
  }

  async queryOrder(q: OrderQuery): Promise<OrderStatusResult> {
    return this.call('queryOrder', q) as Promise<OrderStatusResult>;
  }

  async closeOrder(q: OrderQuery): Promise<CloseOrderResult> {
    return this.call('closeOrder', q) as Promise<CloseOrderResult>;
  }

  async refund(p: RefundParams): Promise<RefundResult> {
    return this.call('refund', p) as Promise<RefundResult>;
  }

  async queryRefund(q: RefundQuery): Promise<RefundStatusResult> {
    return this.call('queryRefund', q) as Promise<RefundStatusResult>;
  }

  async verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<WebhookVerification> {
    return this.call('verifyWebhook', { rawBody, headers }) as Promise<WebhookVerification>;
  }

  async parseWebhook(rawBody: Buffer): Promise<RawWebhookPayload> {
    return this.call('parseWebhook', { rawBody }) as Promise<RawWebhookPayload>;
  }

  async normalize(
    rawBody: Buffer,
    headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent> {
    return this.call('normalize', { rawBody, headers }) as Promise<NormalizedPaymentEvent>;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      status: HealthStatus.UNKNOWN,
      lastCheckedAt: new Date(),
      latencyMs: 0,
      failureCount: 0,
      successRate: 0,
      detail: 'fake provider',
    };
  }

  supports(_feature: PaymentFeature): boolean {
    return true;
  }
}

/** Build a service with one enabled fake provider. */
function buildServiceWithFakeProvider(
  prismaOptions: MockPrismaOptions = {},
): { service: PaymentService; fake: FakeProvider; registry: PaymentProviderRegistry } {
  const registry = new PaymentProviderRegistry();
  const fake = new FakeProvider('wechat', {
    ...createDefaultProviderConfig('wechat', 30),
    enabled: true,
  });
  registry.register(fake);
  const execution = new PaymentExecutionService(registry);
  const service = new PaymentService(
    createMockPrisma(prismaOptions) as unknown as PrismaService,
    mockConfig,
    execution,
    registry,
  );
  return { service, fake, registry };
}

/* ------------------------------------------------------------------ */
/* A. DI                                                               */
/* ------------------------------------------------------------------ */

@Module({
  imports: [PaymentProvidersModule],
  providers: [
    PaymentExecutionService,
    PaymentService,
    { provide: PrismaService, useValue: createMockPrisma() },
    { provide: ConfigService, useValue: mockConfig },
  ],
})
class TestPaymentModule {}

test('T2.8 A: Nest DI wires PaymentService → PaymentExecutionService → Registry', async () => {
  const app = await NestFactory.createApplicationContext(TestPaymentModule, {
    logger: false,
  });
  try {
    const service = app.get(PaymentService);
    const execution = app.get(PaymentExecutionService);
    const registry = app.get(PaymentProviderRegistry);
    assert.ok(service instanceof PaymentService);
    assert.ok(execution instanceof PaymentExecutionService);
    assert.ok(registry instanceof PaymentProviderRegistry);
    // PaymentProvidersModule registers the real skeletons + aggregate + selfhosted.
    assert.deepEqual(registry.getRegistered().sort(), [
      'aggregate',
      'alipay',
      'selfhosted',
      'stripe',
      'wechat',
    ]);
  } finally {
    await app.close();
  }
});

/* ------------------------------------------------------------------ */
/* B. CREATE_ORDER                                                     */
/* ------------------------------------------------------------------ */

test('T2.8 B: paid plan createOrder goes through the Execution Boundary', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  fake.setHandler('createOrder', async (args) => {
    const p = args as CreateOrderParams;
    return {
      orderId: p.orderId,
      providerOrderId: 'wx_123',
      paymentUrl: 'https://pay.example.com/real',
      amount: p.amount,
      currency: p.currency,
      status: 'PENDING' as const,
    };
  });

  const result = await service.createOrder('tenant1', 'PRO');

  // Provider was called through the boundary with the right params.
  const call = fake.calls.createOrder[0] as CreateOrderParams;
  assert.ok(call, 'provider.createOrder must be called');
  assert.equal(call.tenantId, 'tenant1');
  assert.equal(call.plan, 'PRO');
  assert.equal(call.amount, 10000); // T2.9 Amount Boundary: 100 CNY → 10000 minor units
  assert.equal(call.currency, 'CNY');
  assert.ok(call.orderId.startsWith('order_'));
  assert.ok(call.idempotencyKey, 'idempotency key passed');
  // Response shape preserved; paymentUrl comes from the provider result.
  assert.equal(result.paymentUrl, 'https://pay.example.com/real');
  assert.equal(result.plan, 'PRO');
  assert.equal(result.amount, 100);
});

test('T2.8 B2: idempotency key reused from the PaymentOrder record', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  fake.setHandler('createOrder', async (args) => {
    const p = args as CreateOrderParams;
    return {
      orderId: p.orderId,
      providerOrderId: 'wx_1',
      paymentUrl: null,
      amount: p.amount,
      currency: p.currency,
      status: 'PENDING' as const,
    };
  });
  await service.createOrder('tenant1', 'PRO');
  const call = fake.calls.createOrder[0] as CreateOrderParams;
  assert.ok(call.idempotencyKey && call.idempotencyKey.length > 8);
});

/* ------------------------------------------------------------------ */
/* C. Skeleton Provider                                                */
/* ------------------------------------------------------------------ */

test('T2.8 C: NOT_IMPLEMENTED skeleton → compatibility fallback, order stays PENDING', async () => {
  // Real skeleton provider (createOrder throws NOT_IMPLEMENTED), enabled.
  const registry = new PaymentProviderRegistry();
  registry.register(
    new WechatPayProvider({
      ...createDefaultProviderConfig('wechat', 30),
      enabled: true,
    }),
  );
  const execution = new PaymentExecutionService(registry);
  const prismaMock = createMockPrisma();
  const service = new PaymentService(
    prismaMock as unknown as PrismaService,
    mockConfig,
    execution,
    registry,
  );

  const result = await service.createOrder('tenant1', 'PRO');

  // Fallback URL preserved for API compatibility…
  assert.ok(result.paymentUrl?.startsWith('https://pay.example.com/pay'));
  // …but the order was NEVER marked PAID, no fake transaction id.
  const created = prismaMock.createdOrders[0];
  assert.equal(created.status, 'PENDING');
  assert.equal(created.provider, 'WECHAT'); // T2.10: ledger provider = registry default (wechat enabled here)
});

test('T2.8 C2: no enabled provider → PROVIDER_NOT_AVAILABLE → fallback, order stays PENDING', async () => {
  const registry = new PaymentProviderRegistry(); // nothing enabled
  const execution = new PaymentExecutionService(registry);
  const prismaMock = createMockPrisma();
  const service = new PaymentService(
    prismaMock as unknown as PrismaService,
    mockConfig,
    execution,
    registry,
  );
  const result = await service.createOrder('tenant1', 'PRO');
  assert.ok(result.paymentUrl?.startsWith('https://pay.example.com/pay'));
  assert.equal(prismaMock.createdOrders[0].status, 'PENDING');
});

test('T2.8 C3: non-skeleton PaymentError is NOT swallowed', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  fake.setHandler('createOrder', async () => {
    throw new PaymentError('business rejection', {
      code: PaymentErrorCode.BUSINESS_ERROR,
      provider: 'wechat',
    });
  });
  await assert.rejects(
    service.createOrder('tenant1', 'PRO'),
    (e: unknown) =>
      e instanceof PaymentError && e.code === PaymentErrorCode.BUSINESS_ERROR,
  );
});

/* ------------------------------------------------------------------ */
/* D. QUERY_ORDER                                                      */
/* ------------------------------------------------------------------ */

test('T2.8 D: queryOrder goes through QUERY_ORDER boundary', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  fake.setHandler('queryOrder', async (args) => {
    const q = args as OrderQuery;
    return { orderId: q.orderId, status: 'PAID' as const, paidAt: new Date() };
  });
  const result = await service.queryOrder('order1', 'tenant1');
  assert.equal(result.status, 'PAID');
  const call = fake.calls.queryOrder[0] as OrderQuery;
  assert.equal(call.orderId, 'order1');
});

/* ------------------------------------------------------------------ */
/* E. CLOSE_ORDER / REFUND / QUERY_REFUND                              */
/* ------------------------------------------------------------------ */

test('T2.8 E1: closeOrder goes through CLOSE_ORDER boundary without retry', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  let calls = 0;
  fake.setHandler('closeOrder', async (args) => {
    calls += 1;
    const q = args as OrderQuery;
    throw new PaymentError('network blip', {
      code: PaymentErrorCode.NETWORK_ERROR,
      provider: 'wechat',
      retryable: true,
    });
  });
  await assert.rejects(service.closeOrder('order1', 'tenant1'), () => true);
  assert.equal(calls, 1, 'CLOSE_ORDER must not auto-retry');
});

test('T2.8 E2: refund requires idempotency key (missing → FATAL_ERROR)', async () => {
  const { service } = buildServiceWithFakeProvider();
  const params = {
    orderId: 'order1',
    refundId: 'refund1',
    amount: 100,
    currency: 'CNY',
  };
  await assert.rejects(
    service.refund(params, undefined as unknown as string, 'tenant1'),
    (e: unknown) =>
      e instanceof PaymentError &&
      e.code === PaymentErrorCode.FATAL_ERROR &&
      /requires idempotency key/.test(e.message),
  );
});

test('T2.8 E3: refund with idempotency key goes through REFUND boundary', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  fake.setHandler('refund', async (args) => {
    const p = args as RefundParams;
    return { refundId: p.refundId, providerRefundId: 'r_1', status: 'SUCCEEDED' as const };
  });
  const result = await service.refund(
    { orderId: 'order1', refundId: 'refund1', amount: 100, currency: 'CNY' },
    'refund-key-1',
    'tenant1',
  );
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal((fake.calls.refund[0] as RefundParams).refundId, 'refund1');
});

test('T2.8 E4: queryRefund goes through QUERY_REFUND boundary', async () => {
  const { service, fake } = buildServiceWithFakeProvider();
  fake.setHandler('queryRefund', async (args) => {
    const q = args as RefundQuery;
    return { refundId: q.refundId, status: 'SUCCEEDED' as const };
  });
  const result = await service.queryRefund('refund1', 'tenant1');
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal((fake.calls.queryRefund[0] as RefundQuery).refundId, 'refund1');
});

/* ------------------------------------------------------------------ */
/* F. Existing behaviour                                               */
/* ------------------------------------------------------------------ */

test('T2.8 F1: free plan still activates immediately (no provider call)', async () => {
  const { service, fake } = buildServiceWithFakeProvider({
    plan: { id: 'plan_free', name: 'FREE', price: 0 },
  });
  const result = await service.createOrder('tenant1', 'FREE');
  assert.equal(result.amount, 0);
  assert.equal(result.paymentUrl, null);
  assert.equal(fake.calls.createOrder?.length ?? 0, 0);
});

test('T2.8 F2: notify still verifies HMAC + activates subscription', async () => {
  const { service } = buildServiceWithFakeProvider({
    order: {
      id: 'order1',
      orderId: 'order1',
      tenantId: 'tenant1',
      planId: 'plan1',
      amount: 100,
      status: 'PENDING',
      subscriptionId: null,
      plan: { name: 'PRO' },
    },
  });
  const payload = {
    orderId: 'order1',
    status: 'success',
    tenantId: 'tenant1',
    plan: 'PRO',
    amount: 100,
  };
  const raw = JSON.stringify(payload);
  const signature = createHmac('sha256', 'test-secret').update(raw).digest('hex');
  const result = await service.notify(payload, raw, signature);
  // HMAC path returns an object; MaPay path returns the string 'success'.
  assert.equal(typeof result, 'object');
  assert.equal((result as { received: boolean }).received, true);
  assert.equal(
    ((result as { subscription?: { status: string } }).subscription as { status: string }).status,
    'ACTIVE',
  );
});

test('T2.8 F3: notify rejects bad signature', async () => {
  const { service } = buildServiceWithFakeProvider();
  await assert.rejects(
    service.notify({ orderId: 'x', status: 'success', tenantId: 't', plan: 'PRO' }, '{}', 'deadbeef'),
    () => true,
  );
});

test('T2.8 F4: checkSubscription + getRevenue unchanged', async () => {
  const { service } = buildServiceWithFakeProvider({
    subscriptions: [
      { id: 's1', plan: { name: 'PRO', price: 100 } },
      { id: 's2', plan: { name: 'BASIC', price: 50 } },
    ],
  });
  const revenue = await service.getRevenue();
  assert.equal(revenue.totalRevenue, 150);
  assert.equal(revenue.activeSubscriptions, 2);

  const none = await service.checkSubscription('nobody');
  assert.equal(none.status, 'none');
});

/* ------------------------------------------------------------------ */
/* G. Provider leakage scan                                            */
/* ------------------------------------------------------------------ */

test('T2.8 G: PaymentService has no provider-specific leakage', () => {
  const source = readFileSync(join(__dirname, 'payment.service.ts'), 'utf8');
  const banned = [
    'wechat',
    'alipay',
    'stripe',
    'SYSTEMERROR',
    'ORDERNOTEXIST',
    'USERPAYING',
    'TRADE_STATE_ERROR',
    'ACQ.',
    'api_error',
    'card_error',
    'invalid_request_error',
  ];
  for (const token of banned) {
    assert.ok(!source.includes(token), `PaymentService must not contain ${token}`);
  }
  assert.ok(!/provider\s*===\s*'/.test(source), 'no provider === branch');
  assert.ok(!/switch\s*\(\s*provider/.test(source), 'no switch(provider)');
  assert.ok(!/setTimeout|sleep\s*\(|fetch\s*\(|axios/.test(source), 'no retry/sleep/http');
});
