/**
 * T2.6 — Circuit Breaker + Registry resilience tests.
 *
 * Uses Node's built-in node:test runner — no new test infrastructure.
 * Run: npx ts-node src/payment/providers/provider-circuit-breaker.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentError, PaymentErrorCode } from '../domain/payment.errors';
import {
  CircuitBreaker,
  CircuitState,
  isCircuitFailure,
} from '../domain/payment.circuit-breaker';
import { HealthStatus } from '../domain/payment.enums';
import {
  PaymentProviderRegistry,
  createDefaultProviderConfig,
} from './payment-provider.registry';
import { WechatPayProvider } from './wechat/wechat-pay.provider';
import { AlipayProvider } from './alipay/alipay.provider';
import { StripeProvider } from './stripe/stripe.provider';
import { NullPaymentProvider } from './null.provider';

function err(code: PaymentErrorCode): PaymentError {
  return new PaymentError(`test ${code}`, { code, provider: 'test' });
}

function failureError(): PaymentError {
  return err(PaymentErrorCode.PROVIDER_ERROR);
}

/** Controllable clock for openMs expiry tests. */
function makeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test('T2.6 1: initial state is CLOSED', () => {
  const cb = new CircuitBreaker();
  assert.equal(cb.getState('wechat'), CircuitState.CLOSED);
  assert.equal(cb.canRequest('wechat'), true);
  assert.equal(cb.getFailureCount('wechat'), 0);
});

test('T2.6 2: failures below threshold keep CLOSED', () => {
  const cb = new CircuitBreaker();
  cb.configure('wechat', { threshold: 5, openMs: 60000 });
  for (let i = 0; i < 4; i++) {
    cb.recordFailure('wechat', failureError());
  }
  assert.equal(cb.getState('wechat'), CircuitState.CLOSED);
  assert.equal(cb.getFailureCount('wechat'), 4);
  assert.equal(cb.canRequest('wechat'), true);
});

test('T2.6 3: failures reaching threshold trip OPEN', () => {
  const cb = new CircuitBreaker();
  cb.configure('wechat', { threshold: 5, openMs: 60000 });
  for (let i = 0; i < 5; i++) {
    cb.recordFailure('wechat', failureError());
  }
  assert.equal(cb.getState('wechat'), CircuitState.OPEN);
});

test('T2.6 4: OPEN refuses requests', () => {
  const cb = new CircuitBreaker();
  cb.configure('wechat', { threshold: 1, openMs: 60000 });
  cb.recordFailure('wechat', failureError());
  assert.equal(cb.getState('wechat'), CircuitState.OPEN);
  assert.equal(cb.canRequest('wechat'), false);
});

test('T2.6 5: OPEN expires into HALF_OPEN', () => {
  const clock = makeClock();
  const cb = new CircuitBreaker(clock.now);
  cb.configure('wechat', { threshold: 1, openMs: 1000 });
  cb.recordFailure('wechat', failureError()); // openedAt = 0
  assert.equal(cb.canRequest('wechat'), false);
  clock.advance(1000); // openMs elapsed
  assert.equal(cb.canRequest('wechat'), true);
  assert.equal(cb.getState('wechat'), CircuitState.HALF_OPEN);
});

test('T2.6 6: HALF_OPEN success closes the circuit', () => {
  const clock = makeClock();
  const cb = new CircuitBreaker(clock.now);
  cb.configure('wechat', { threshold: 1, openMs: 1000 });
  cb.recordFailure('wechat', failureError());
  clock.advance(1000);
  cb.canRequest('wechat'); // probe → HALF_OPEN
  assert.equal(cb.getState('wechat'), CircuitState.HALF_OPEN);
  cb.recordSuccess('wechat');
  assert.equal(cb.getState('wechat'), CircuitState.CLOSED);
  assert.equal(cb.getFailureCount('wechat'), 0);
  assert.equal(cb.canRequest('wechat'), true);
});

test('T2.6 7: HALF_OPEN failure reopens with fresh timer', () => {
  const clock = makeClock();
  const cb = new CircuitBreaker(clock.now);
  cb.configure('wechat', { threshold: 1, openMs: 1000 });
  cb.recordFailure('wechat', failureError());
  clock.advance(1000);
  cb.canRequest('wechat'); // HALF_OPEN probe
  cb.recordFailure('wechat', failureError()); // probe failed
  assert.equal(cb.getState('wechat'), CircuitState.OPEN);
  assert.equal(cb.canRequest('wechat'), false);
  // fresh timer: must wait another openMs
  clock.advance(999);
  assert.equal(cb.canRequest('wechat'), false);
  clock.advance(1);
  assert.equal(cb.canRequest('wechat'), true);
});

test('T2.6 8: HALF_OPEN allows only one probe at a time', () => {
  const clock = makeClock();
  const cb = new CircuitBreaker(clock.now);
  cb.configure('wechat', { threshold: 1, openMs: 1000 });
  cb.recordFailure('wechat', failureError());
  clock.advance(1000);
  assert.equal(cb.canRequest('wechat'), true); // probe 1 granted
  assert.equal(cb.canRequest('wechat'), false); // probe 2 rejected
  assert.equal(cb.canRequest('wechat'), false);
  // after the probe succeeds, requests flow again
  cb.recordSuccess('wechat');
  assert.equal(cb.canRequest('wechat'), true);
});

test('T2.6 9: BUSINESS_ERROR does not trip the circuit', () => {
  const cb = new CircuitBreaker();
  cb.configure('wechat', { threshold: 1, openMs: 60000 });
  for (let i = 0; i < 10; i++) {
    cb.recordFailure('wechat', err(PaymentErrorCode.BUSINESS_ERROR));
  }
  assert.equal(cb.getState('wechat'), CircuitState.CLOSED);
  assert.equal(cb.getFailureCount('wechat'), 0);
});

test('T2.6 10: FATAL_ERROR does not trip the circuit', () => {
  const cb = new CircuitBreaker();
  cb.configure('wechat', { threshold: 1, openMs: 60000 });
  for (let i = 0; i < 10; i++) {
    cb.recordFailure('wechat', err(PaymentErrorCode.FATAL_ERROR));
  }
  assert.equal(cb.getState('wechat'), CircuitState.CLOSED);
});

test('T2.6 11: PROVIDER_NOT_AVAILABLE does not trip the circuit', () => {
  const cb = new CircuitBreaker();
  cb.configure('wechat', { threshold: 1, openMs: 60000 });
  for (let i = 0; i < 10; i++) {
    cb.recordFailure('wechat', err(PaymentErrorCode.PROVIDER_NOT_AVAILABLE));
  }
  assert.equal(cb.getState('wechat'), CircuitState.CLOSED);
});

test('T2.6 11b: isCircuitFailure classification is exact', () => {
  assert.equal(isCircuitFailure(err(PaymentErrorCode.NETWORK_ERROR)), true);
  assert.equal(isCircuitFailure(err(PaymentErrorCode.PROVIDER_ERROR)), true);
  assert.equal(isCircuitFailure(err(PaymentErrorCode.RETRYABLE_ERROR)), true);
  assert.equal(isCircuitFailure(err(PaymentErrorCode.BUSINESS_ERROR)), false);
  assert.equal(isCircuitFailure(err(PaymentErrorCode.FATAL_ERROR)), false);
  assert.equal(isCircuitFailure(err(PaymentErrorCode.PROVIDER_NOT_AVAILABLE)), false);
});

/* ------------------------------------------------------------------ */
/* Registry integration                                                */
/* ------------------------------------------------------------------ */

function buildRegistryWithTwoProviders(): PaymentProviderRegistry {
  const registry = new PaymentProviderRegistry();
  registry.register(
    new WechatPayProvider({
      ...createDefaultProviderConfig('wechat', 30),
      enabled: true,
      circuitBreaker: { threshold: 1, openMs: 60000 },
    }),
  );
  registry.register(
    new AlipayProvider({
      ...createDefaultProviderConfig('alipay', 20),
      enabled: true,
      circuitBreaker: { threshold: 1, openMs: 60000 },
    }),
  );
  return registry;
}

test('T2.6 12: registry skips an OPEN provider', () => {
  const registry = buildRegistryWithTwoProviders();
  const cb = registry.getCircuitBreaker();
  // WeChat (priority 30) trips OPEN; Alipay (priority 20) stays healthy.
  cb.recordFailure('wechat', failureError());
  assert.equal(cb.getState('wechat'), CircuitState.OPEN);

  const chosen = registry.findAvailableProvider();
  assert.ok(chosen instanceof AlipayProvider, 'should fall back to Alipay');
});

test('T2.6 13: registry picks backup provider when top provider is OPEN', () => {
  const registry = buildRegistryWithTwoProviders();
  const cb = registry.getCircuitBreaker();
  cb.recordFailure('wechat', failureError()); // top priority provider OPEN
  const chosen = registry.findAvailableProvider();
  assert.ok(chosen instanceof AlipayProvider);
});

test('T2.6 14: all providers OPEN → NullPaymentProvider', () => {
  const registry = buildRegistryWithTwoProviders();
  const cb = registry.getCircuitBreaker();
  cb.recordFailure('wechat', failureError());
  cb.recordFailure('alipay', failureError());
  assert.equal(cb.getState('wechat'), CircuitState.OPEN);
  assert.equal(cb.getState('alipay'), CircuitState.OPEN);
  const chosen = registry.findAvailableProvider();
  assert.ok(chosen instanceof NullPaymentProvider);
});

test('T2.6 14b: findAvailableProvider also honours supports(feature)', () => {
  const registry = buildRegistryWithTwoProviders();
  // WeChat supports JSAPI; Alipay supports JSAPI too, so with feature JSAPI
  // the highest-priority provider (wechat) wins.
  const chosen = registry.findAvailableProvider(undefined);
  assert.ok(chosen instanceof WechatPayProvider);
});

test('T2.6 14c: registry skips provider whose health is DOWN', () => {
  const registry = new PaymentProviderRegistry({
    healthProvider: (name) =>
      name === 'wechat'
        ? {
            status: HealthStatus.DOWN,
            lastCheckedAt: new Date(),
            latencyMs: 0,
            failureCount: 0,
            successRate: 0,
            detail: 'down',
          }
        : undefined,
  });
  registry.register(
    new WechatPayProvider({
      ...createDefaultProviderConfig('wechat', 30),
      enabled: true,
      circuitBreaker: { threshold: 1, openMs: 60000 },
    }),
  );
  registry.register(
    new AlipayProvider({
      ...createDefaultProviderConfig('alipay', 20),
      enabled: true,
      circuitBreaker: { threshold: 1, openMs: 60000 },
    }),
  );
  const chosen = registry.findAvailableProvider();
  assert.ok(chosen instanceof AlipayProvider, 'DOWN wechat should be skipped');
});
