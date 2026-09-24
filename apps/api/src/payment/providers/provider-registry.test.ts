/**
 * T2.4 — Provider Registry & DI tests (minimal, fully type-safe).
 *
 * Uses Node's built-in node:test + @nestjs/core (already installed).
 * Run: npx ts-node src/payment/providers/provider-registry.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';

import { PaymentError, PaymentErrorCode } from '../domain/payment.errors';
import { PaymentProvidersModule } from '../payment-providers.module';
import { WechatPayProvider } from './wechat/wechat-pay.provider';
import { AlipayProvider } from './alipay/alipay.provider';
import { StripeProvider } from './stripe/stripe.provider';
import { NullPaymentProvider } from './null.provider';
import { UnknownPaymentProvider } from './unknown.provider';
import {
  PaymentProviderRegistry,
  createDefaultProviderConfig,
} from './payment-provider.registry';

function buildRegistry(): PaymentProviderRegistry {
  const registry = new PaymentProviderRegistry();
  registry.register(new WechatPayProvider(createDefaultProviderConfig('wechat', 30)));
  registry.register(new AlipayProvider(createDefaultProviderConfig('alipay', 20)));
  registry.register(new StripeProvider(createDefaultProviderConfig('stripe', 10)));
  return registry;
}

test('T2.4: Nest DI can create the three providers and registry', async () => {
  const app = await NestFactory.createApplicationContext(PaymentProvidersModule, {
    logger: false,
  });
  try {
    const wechat = app.get(WechatPayProvider);
    const alipay = app.get(AlipayProvider);
    const stripe = app.get(StripeProvider);
    const registry = app.get(PaymentProviderRegistry);

    assert.ok(wechat instanceof WechatPayProvider);
    assert.ok(alipay instanceof AlipayProvider);
    assert.ok(stripe instanceof StripeProvider);
    assert.ok(registry instanceof PaymentProviderRegistry);

    // DI default config is disabled-safe.
    assert.equal(wechat.config.enabled, false);
    assert.equal(alipay.config.enabled, false);
    assert.equal(stripe.config.enabled, false);

    // Registry auto-registered the real providers (wechat/alipay/stripe +
    // aggregate + selfhosted).
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

test('T2.4: registry.get() resolves real providers by key', () => {
  const registry = buildRegistry();
  assert.ok(registry.get('wechat') instanceof WechatPayProvider);
  assert.ok(registry.get('alipay') instanceof AlipayProvider);
  assert.ok(registry.get('stripe') instanceof StripeProvider);
});

test('T2.4: registry.get() falls back to UnknownPaymentProvider', () => {
  const registry = buildRegistry();
  assert.ok(registry.get('unknown-provider') instanceof UnknownPaymentProvider);
  assert.ok(registry.get('does-not-exist') instanceof UnknownPaymentProvider);
  assert.ok(registry.get('unknown') instanceof UnknownPaymentProvider);
});

test('T2.4: getByPriority() contains the three real providers, highest priority first', () => {
  const registry = buildRegistry();
  const byPriority = registry.getByPriority();
  assert.equal(byPriority.length, 3);
  const keys = byPriority.map((p) => p.name);
  assert.deepEqual(keys, ['wechat', 'alipay', 'stripe']); // 30 > 20 > 10
  // Null/Unknown never join the priority routing set.
  assert.ok(!keys.includes('null'));
  assert.ok(!keys.includes('unknown'));
});

test('T2.4: disabled providers are excluded from active providers', () => {
  const registry = buildRegistry(); // all enabled: false
  assert.deepEqual(registry.getActiveProviders(), []);
});

test('T2.4: findAvailableProvider() returns NullPaymentProvider when all disabled', () => {
  const registry = buildRegistry();
  assert.ok(registry.findAvailableProvider() instanceof NullPaymentProvider);
  assert.ok(registry.getDefault() instanceof NullPaymentProvider);
});

test('T2.4: NullPaymentProvider business methods throw PROVIDER_NOT_AVAILABLE', async () => {
  const registry = buildRegistry();
  const nullProvider = registry.findAvailableProvider();
  assert.ok(nullProvider instanceof NullPaymentProvider);
  await assert.rejects(
    () => nullProvider.createOrder({
      orderId: 'order_test',
      tenantId: 'tenant_test',
      plan: 'PRO',
      amount: 100,
      currency: 'CNY',
    }),
    (err: unknown) => {
      assert.ok(err instanceof PaymentError, 'must throw PaymentError');
      assert.equal(err.code, PaymentErrorCode.PROVIDER_NOT_AVAILABLE);
      return true;
    },
  );
});

test('T2.4: registry.get("unknown") returns UnknownPaymentProvider throwing PROVIDER_NOT_AVAILABLE', async () => {
  const registry = buildRegistry();
  const unknownProvider = registry.get('unknown');
  assert.ok(unknownProvider instanceof UnknownPaymentProvider);
  await assert.rejects(
    () => unknownProvider.createOrder({
      orderId: 'order_test',
      tenantId: 'tenant_test',
      plan: 'PRO',
      amount: 100,
      currency: 'CNY',
    }),
    (err: unknown) => {
      assert.ok(err instanceof PaymentError, 'must throw PaymentError');
      assert.equal(err.code, PaymentErrorCode.PROVIDER_NOT_AVAILABLE);
      return true;
    },
  );
});

test('T2.4: ProviderConfig has a single TypeScript definition in domain', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..'); // src/payment
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  walk(root);
  const defs = files.filter((f) => {
    const source = fs.readFileSync(f, 'utf8');
    return /^\s*(export\s+)?interface\s+ProviderConfig\b/m.test(source);
  });
  assert.deepEqual(defs, [
    path.join(root, 'domain', 'payment.types.ts'),
  ]);
});

test('T2.4: an enabled provider becomes available for routing', () => {
  const registry = new PaymentProviderRegistry();
  registry.register(new AlipayProvider(createDefaultProviderConfig('alipay', 20)));
  registry.register(
    new WechatPayProvider({ ...createDefaultProviderConfig('wechat', 30), enabled: true }),
  );
  registry.register(new StripeProvider(createDefaultProviderConfig('stripe', 10)));

  const active = registry.getActiveProviders();
  assert.equal(active.length, 1);
  assert.equal(active[0].name, 'wechat');

  assert.ok(registry.findAvailableProvider() instanceof WechatPayProvider);
  assert.ok(registry.getDefault() instanceof WechatPayProvider);
});
