/**
 * T2.9 — Customer Journey integration tests (REAL database).
 *
 * End-to-end: Register → Login → Plan → Order → Payment callback →
 * Subscription ACTIVE, using the real local PostgreSQL (schema migrated).
 * Test data uses unique emails and is cleaned up afterwards.
 *
 * Run: npx ts-node src/payment/customer-journey.integration.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac, randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, SubscriptionStatus, PaymentOrderStatus } from '@prisma/client';

import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';

// L2: these tests exercise the payment journey, not registration gating.
// Open registration so register() without inviteCode stays valid here.
process.env.REGISTER_INVITE_REQUIRED = 'false';
import { PaymentService } from './payment.service';
import { PaymentExecutionService } from './execution/payment-execution.service';
import {
  PaymentProviderRegistry,
  createDefaultProviderConfig,
} from './providers/payment-provider.registry';
import { AggregatePaymentProvider } from './providers/aggregate/aggregate-payment.provider';
import { PaymentErrorCode } from './domain/payment.errors';
import type { PaymentProvider } from './providers/payment-provider.interface';

const prisma = new PrismaClient();
const jwtService = new JwtService({ secret: 't29-test-jwt-secret' });
const auditService = new AuditService(prisma as never);

const mockConfig = {
  get: (key: string) =>
    key === 'PAYMENT_WEBHOOK_SECRET' ? 'test-secret' : undefined,
} as never;

const createdTenantIds: string[] = [];

function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
}

function buildPaymentService(): PaymentService {
  const registry = new PaymentProviderRegistry();
  registry.register(
    new AggregatePaymentProvider({
      ...createDefaultProviderConfig('aggregate', 40),
      enabled: false, // skeleton — not a real payment channel
    }),
  );
  const execution = new PaymentExecutionService(registry);
  return new PaymentService(prisma as never, mockConfig, execution, registry);
}

function signPayload(raw: string): string {
  return createHmac('sha256', 'test-secret').update(raw).digest('hex');
}

after(async () => {
  // Clean up all test tenants (PaymentOrder cascades; subscription/user manual).
  for (const tenantId of createdTenantIds) {
    await prisma.paymentOrder.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

async function registerFree(): Promise<{ auth: AuthService; email: string; tenantId: string }> {
  const auth = new AuthService(prisma as never, jwtService, auditService);
  const email = uniqueEmail('free');
  const res = await auth.register({ email, password: 'pass123456', name: 'Free User', plan: 'FREE' });
  const user = await prisma.user.findUnique({ where: { id: res.user.id } });
  createdTenantIds.push(user!.tenantId);
  return { auth, email, tenantId: user!.tenantId };
}

/** Register a PAID plan user — must have NO subscription at all. */
async function registerPaid(): Promise<{ email: string; tenantId: string }> {
  const auth = new AuthService(prisma as never, jwtService, auditService);
  const email = uniqueEmail('paid');
  const res = await auth.register({ email, password: 'pass123456', name: 'Paid User', plan: 'PRO' });
  const user = await prisma.user.findUnique({ where: { id: res.user.id } });
  createdTenantIds.push(user!.tenantId);
  return { email, tenantId: user!.tenantId };
}

/* ------------------------------------------------------------------ */
/* A. FREE registration → ACTIVE                                       */
/* ------------------------------------------------------------------ */

test('T2.9 A: FREE registration activates subscription immediately', async () => {
  const { tenantId } = await registerFree();
  const sub = await prisma.subscription.findFirst({
    where: { tenantId, status: SubscriptionStatus.ACTIVE },
  });
  assert.ok(sub, 'FREE must create ACTIVE subscription');
});

/* ------------------------------------------------------------------ */
/* B. Paid registration → NOT active                                   */
/* ------------------------------------------------------------------ */

test('T2.9 B: PRO registration must NOT create ACTIVE subscription', async () => {
  const auth = new AuthService(prisma as never, jwtService, auditService);
  const email = uniqueEmail('pro');
  const res = await auth.register({ email, password: 'pass123456', name: 'Pro User', plan: 'PRO' });
  const user = await prisma.user.findUnique({ where: { id: res.user.id } });
  createdTenantIds.push(user!.tenantId);

  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId: user!.tenantId, status: SubscriptionStatus.ACTIVE },
  });
  assert.equal(activeSub, null, 'PRO registration must not activate');
});

test('T2.9 B2: invalid plan is rejected at registration', async () => {
  const auth = new AuthService(prisma as never, jwtService, auditService);
  await assert.rejects(
    auth.register({ email: uniqueEmail('bad'), password: 'pass123456', name: 'X', plan: 'whatever' }),
    () => true,
  );
});

/* ------------------------------------------------------------------ */
/* C. Login paid user → subscription not active                        */
/* ------------------------------------------------------------------ */

test('T2.9 C: paid user can login, subscription is not ACTIVE', async () => {
  const auth = new AuthService(prisma as never, jwtService, auditService);
  const email = uniqueEmail('login');
  const reg = await auth.register({ email, password: 'pass123456', name: 'Login User', plan: 'ENTERPRISE' });
  const user = await prisma.user.findUnique({ where: { id: reg.user.id } });
  createdTenantIds.push(user!.tenantId);

  const login = await auth.login({ email, password: 'pass123456' });
  assert.ok(login.accessToken, 'login must return token');
  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId: user!.tenantId, status: SubscriptionStatus.ACTIVE },
  });
  assert.equal(activeSub, null, 'paid user must NOT be ACTIVE before payment');
});

/* ------------------------------------------------------------------ */
/* D. Purchase → PaymentOrder created                                  */
/* ------------------------------------------------------------------ */

test('T2.9 D: create-order creates a PENDING PaymentOrder', async () => {
  const { tenantId } = await registerFree();
  const payment = buildPaymentService();
  const result = await payment.createOrder(tenantId, 'PRO');
  assert.ok(result.orderId);
  assert.ok(result.idempotencyKey);
  assert.ok(result.paymentUrl); // skeleton fallback URL (no real channel)

  const order = await prisma.paymentOrder.findUnique({
    where: { orderId: result.orderId },
  });
  assert.ok(order);
  assert.equal(order.tenantId, tenantId);
  assert.equal(order.status, PaymentOrderStatus.PENDING);
  // T2.10: ledger provider follows the registry default — with no enabled
  // provider in this test, the order lands on MANUAL (no real channel).
  assert.equal(order.provider, 'MANUAL');
});

/* ------------------------------------------------------------------ */
/* E. Duplicate purchase → same order returned, no explosion           */
/* ------------------------------------------------------------------ */

test('T2.9 E: repeated create-order reuses the existing pending order', async () => {
  const { tenantId } = await registerFree();
  const payment = buildPaymentService();
  const first = await payment.createOrder(tenantId, 'PRO');
  const second = await payment.createOrder(tenantId, 'PRO');
  assert.equal(second.orderId, first.orderId, 'must reuse existing pending order');
  const count = await prisma.paymentOrder.count({ where: { tenantId } });
  assert.equal(count, 1, 'must not create unlimited duplicate orders');
});

/* ------------------------------------------------------------------ */
/* F. Payment callback → PAID + ACTIVE                                 */
/* ------------------------------------------------------------------ */

test('T2.9 F: valid webhook marks order PAID and activates subscription', async () => {
  const { tenantId } = await registerFree();
  const payment = buildPaymentService();
  const created = await payment.createOrder(tenantId, 'PRO');

  const payload = {
    orderId: created.orderId,
    status: 'success',
    tenantId,
    plan: 'PRO',
    amount: 299,
  };
  const raw = JSON.stringify(payload);
  const signature = signPayload(raw);
  const notifyResult = await payment.notify(payload, raw, signature);
  assert.equal((notifyResult as { received: boolean }).received, true);

  const order = await prisma.paymentOrder.findUnique({ where: { orderId: created.orderId } });
  assert.equal(order!.status, PaymentOrderStatus.PAID);
  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId, status: SubscriptionStatus.ACTIVE },
    include: { plan: true },
  });
  assert.ok(activeSub);
  assert.equal(activeSub.plan.name, 'PRO');
});

/* ------------------------------------------------------------------ */
/* G. Duplicate callback → single activation                           */
/* ------------------------------------------------------------------ */

test('T2.9 G: repeated webhooks do not re-activate', async () => {
  const { tenantId } = await registerFree();
  const payment = buildPaymentService();
  const created = await payment.createOrder(tenantId, 'BASIC');

  const payload = {
    orderId: created.orderId,
    status: 'success',
    tenantId,
    plan: 'BASIC',
    amount: 99,
  };
  const raw = JSON.stringify(payload);
  const signature = signPayload(raw);

  const r1 = await payment.notify(payload, raw, signature);
  const r2 = await payment.notify(payload, raw, signature);
  assert.equal((r1 as { received: boolean }).received, true);
  assert.equal((r2 as { received: boolean }).received, true);
  assert.equal((r2 as { message: string }).message, 'Order already processed');

  const activeCount = await prisma.subscription.count({
    where: { tenantId, status: SubscriptionStatus.ACTIVE },
  });
  assert.equal(activeCount, 1, 'duplicate callback must not double-activate');
});

/* ------------------------------------------------------------------ */
/* H. Payment failure → no ACTIVE subscription                         */
/* ------------------------------------------------------------------ */

test('T2.9 H: failed callback does not activate subscription', async () => {
  const { tenantId } = await registerPaid(); // no subscription at all
  const payment = buildPaymentService();
  const created = await payment.createOrder(tenantId, 'PRO');

  const payload = {
    orderId: created.orderId,
    status: 'failed',
    tenantId,
    plan: 'PRO',
    amount: 299,
  };
  const raw = JSON.stringify(payload);
  const signature = signPayload(raw);
  const result = await payment.notify(payload, raw, signature);
  assert.equal((result as { message: string }).message, 'Payment not successful');

  const order = await prisma.paymentOrder.findUnique({ where: { orderId: created.orderId } });
  assert.equal(order!.status, PaymentOrderStatus.CANCELLED);
  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId, status: SubscriptionStatus.ACTIVE },
  });
  assert.equal(activeSub, null);
});

/* ------------------------------------------------------------------ */
/* H2. Invalid signature → rejected                                    */
/* ------------------------------------------------------------------ */

test('T2.9 H2: invalid webhook signature is rejected', async () => {
  const { tenantId } = await registerFree();
  const payment = buildPaymentService();
  const created = await payment.createOrder(tenantId, 'PRO');
  const payload = { orderId: created.orderId, status: 'success', tenantId, plan: 'PRO', amount: 299 };
  await assert.rejects(
    payment.notify(payload, JSON.stringify(payload), 'deadbeef'),
    () => true,
  );
  const order = await prisma.paymentOrder.findUnique({ where: { orderId: created.orderId } });
  assert.notEqual(order!.status, PaymentOrderStatus.PAID);
});

/* ------------------------------------------------------------------ */
/* I. UNKNOWN_SIDE_EFFECT → order UNKNOWN, no activation, no retry     */
/* ------------------------------------------------------------------ */

test('T2.9 I: unknown outcome keeps order UNKNOWN and never activates', async () => {
  const { tenantId } = await registerPaid(); // no subscription at all
  // Registry with an enabled fake provider that returns UNKNOWN_SIDE_EFFECT
  // (simulating a create-order timeout where the channel may have succeeded).
  const registry = new PaymentProviderRegistry();
  const fake = new (class implements PaymentProvider {
    readonly name = 'aggregate';
    readonly displayName = 'Aggregate Payment';
    readonly config = { ...createDefaultProviderConfig('aggregate', 40), enabled: true };
    supports(): boolean { return true; }
    async createOrder(): Promise<never> {
      const { PaymentError } = await import('./domain/payment.errors');
      throw new PaymentError('timeout, outcome unknown', {
        code: PaymentErrorCode.UNKNOWN_SIDE_EFFECT,
        provider: 'aggregate',
      });
    }
    async queryOrder(): Promise<never> { throw new Error('n/a'); }
    async closeOrder(): Promise<never> { throw new Error('n/a'); }
    async refund(): Promise<never> { throw new Error('n/a'); }
    async queryRefund(): Promise<never> { throw new Error('n/a'); }
    async verifyWebhook(): Promise<never> { throw new Error('n/a'); }
    async parseWebhook(): Promise<never> { throw new Error('n/a'); }
    async normalize(): Promise<never> { throw new Error('n/a'); }
    async healthCheck(): Promise<never> { throw new Error('n/a'); }
  })();
  registry.register(fake);
  const execution = new PaymentExecutionService(registry);
  const payment = new PaymentService(prisma as never, mockConfig, execution, registry);

  await assert.rejects(
    payment.createOrder(tenantId, 'PRO'),
    (e: { code?: string }) => e?.code === PaymentErrorCode.UNKNOWN_SIDE_EFFECT,
  );

  const orders = await prisma.paymentOrder.findMany({
    where: { tenantId, plan: { name: 'PRO' } },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(orders[0]?.status, PaymentOrderStatus.UNKNOWN, 'order must be UNKNOWN');
  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId, status: SubscriptionStatus.ACTIVE },
  });
  assert.equal(activeSub, null, 'unknown outcome must never activate');
  const orderCount = await prisma.paymentOrder.count({ where: { tenantId } });
  assert.equal(orderCount, 1, 'no second payment order may be created');
});

/* ------------------------------------------------------------------ */
/* J. Frontend API contract                                            */
/* ------------------------------------------------------------------ */

test('T2.9 J: dashboard subscription page really calls create-order', () => {
  // __dirname = apps/api/src/payment → up 4 levels = D:\SmartCS
  const dashboardPage = join(
    __dirname, '..', '..', '..', '..',
    'apps', 'dashboard', 'src', 'app', 'subscription', 'page.tsx',
  );
  const source = readFileSync(dashboardPage, 'utf8').replace(/^\uFEFF/, '');
  assert.ok(source.includes('/payment/create-order'), 'page must call create-order');
  assert.ok(source.includes('fetch('), 'page must fetch the API');
});

/* ------------------------------------------------------------------ */
/* K. Provider leakage                                                 */
/* ------------------------------------------------------------------ */

test('T2.9 K: PaymentService has no provider-specific branch', () => {
  const source = readFileSync(join(__dirname, 'payment.service.ts'), 'utf8');
  for (const token of ['wechat', 'alipay', 'stripe', '=== \'ma\'', 'provider === ']) {
    assert.ok(!source.includes(token), `PaymentService must not contain ${token}`);
  }
});
