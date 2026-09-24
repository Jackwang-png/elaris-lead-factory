/**
 * T2.7 — PaymentExecutionService tests (execution boundary).
 *
 * Uses Node's built-in node:test runner — no new test infrastructure.
 * Providers stay skeletons (NOT_IMPLEMENTED); behaviour is simulated in
 * the injected operation callback, never by editing providers.
 *
 * Run: npx ts-node src/payment/providers/provider-execution.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentError, PaymentErrorCode } from '../domain/payment.errors';
import { RetryPolicy } from '../domain/payment.policy';
import { PaymentProviderRegistry, createDefaultProviderConfig } from './payment-provider.registry';
import { WechatPayProvider } from './wechat/wechat-pay.provider';
import { AlipayProvider } from './alipay/alipay.provider';
import { StripeProvider } from './stripe/stripe.provider';
import { PaymentExecutionService } from '../execution/payment-execution.service';
import {
  PaymentExecutionAttempt,
  PaymentOperation,
} from '../execution/payment-execution.types';

function buildRegistry(): PaymentProviderRegistry {
  const registry = new PaymentProviderRegistry();
  registry.register(
    new WechatPayProvider({
      ...createDefaultProviderConfig('wechat', 30),
      enabled: true,
    }),
  );
  registry.register(
    new AlipayProvider({
      ...createDefaultProviderConfig('alipay', 20),
      enabled: true,
    }),
  );
  registry.register(
    new StripeProvider({
      ...createDefaultProviderConfig('stripe', 10),
      enabled: true,
    }),
  );
  return registry;
}

function err(code: PaymentErrorCode, retryable = false): PaymentError {
  return new PaymentError(`simulated ${code}`, {
    code,
    provider: 'wechat',
    retryable,
  });
}

function createOrderResult(orderId: string) {
  return {
    orderId,
    providerOrderId: `p_${orderId}`,
    paymentUrl: null,
    amount: 100,
    currency: 'CNY',
    status: 'PENDING' as const,
  };
}

/* ------------------------------------------------------------------ */
/* Basic execution                                                     */
/* ------------------------------------------------------------------ */

test('T2.7 1: registry selects the top-priority provider', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  let selected: string | undefined;
  const result = await service.execute(PaymentOperation.QUERY_ORDER, {
    operation: async (provider, attempt) => {
      selected = attempt.providerName;
      return { orderId: 'o1', status: 'PENDING' as const };
    },
  });
  assert.equal(selected, 'wechat'); // priority 30 wins
  assert.equal(result.status, 'PENDING');
});

test('T2.7 2: provider operation success returns the result untouched', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  const result = await service.execute(PaymentOperation.CREATE_ORDER, {
    idempotencyKey: 'key-2',
    operation: async (provider) => createOrderResult('o2'),
  });
  assert.equal(result.orderId, 'o2');
});

test('T2.7 3: PaymentError propagates to the caller', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      operation: async () => {
        throw err(PaymentErrorCode.BUSINESS_ERROR);
      },
    }),
    (e: unknown) =>
      e instanceof PaymentError && e.code === PaymentErrorCode.BUSINESS_ERROR,
  );
});

test('T2.7 4: provider-specific error never leaks as raw error', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  // Simulate an SDK error object leaking from a provider.
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      operation: async () => {
        throw new Error('SYSTEMERROR from wechat sdk');
      },
    }),
    (e: unknown) =>
      e instanceof PaymentError && e.code === PaymentErrorCode.PROVIDER_ERROR,
  );
});

/* ------------------------------------------------------------------ */
/* Retry                                                               */
/* ------------------------------------------------------------------ */

test('T2.7 5: NETWORK_ERROR is retried then succeeds', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  const attempts: string[] = [];
  const result = await service.execute(PaymentOperation.QUERY_ORDER, {
    operation: async (provider, attempt) => {
      attempts.push(attempt.providerName);
      if (attempt.attempt === 0) {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      }
      return { orderId: 'o5', status: 'PAID' as const };
    },
  });
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], 'wechat');
  assert.equal(attempts[1], 'wechat'); // same provider
  assert.equal(result.status, 'PAID');
});

test('T2.7 6: PROVIDER_ERROR is retried when retryable', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  let calls = 0;
  const result = await service.execute(PaymentOperation.QUERY_ORDER, {
    operation: async (provider, attempt) => {
      calls += 1;
      if (attempt.attempt === 0) {
        throw err(PaymentErrorCode.PROVIDER_ERROR, true);
      }
      return { orderId: 'o6', status: 'PAID' as const };
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.orderId, 'o6');
});

test('T2.7 7: BUSINESS_ERROR is not retried', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  let calls = 0;
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      operation: async () => {
        calls += 1;
        throw err(PaymentErrorCode.BUSINESS_ERROR);
      },
    }),
    (e: unknown) => e instanceof PaymentError,
  );
  assert.equal(calls, 1);
});

test('T2.7 8: FATAL_ERROR is not retried', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  let calls = 0;
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      operation: async () => {
        calls += 1;
        throw err(PaymentErrorCode.FATAL_ERROR);
      },
    }),
    (e: unknown) => e instanceof PaymentError,
  );
  assert.equal(calls, 1);
});

test('T2.7 9: maxAttempts bounds retries', async () => {
  // Single-provider registry so failover cannot mask the attempt count.
  const registry = new PaymentProviderRegistry();
  registry.register(
    new WechatPayProvider({
      ...createDefaultProviderConfig('wechat', 30),
      enabled: true,
    }),
  );
  const service = new PaymentExecutionService(registry);
  let calls = 0;
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      retryConfig: {
        policy: RetryPolicy.CONFIGURABLE,
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 4,
        jitter: false,
      },
      operation: async () => {
        calls += 1;
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      },
    }),
    (e: unknown) =>
      e instanceof PaymentError && e.code === PaymentErrorCode.NETWORK_ERROR,
  );
  assert.equal(calls, 2); // attempt 0 + attempt 1 (maxAttempts=2)
});

/* ------------------------------------------------------------------ */
/* Circuit                                                             */
/* ------------------------------------------------------------------ */

test('T2.7 10: failure records circuit failure', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      // Single attempt: fail once on wechat, then failover; wechat count = 1.
      retryConfig: {
        policy: RetryPolicy.CONFIGURABLE,
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 4,
        jitter: false,
      },
      operation: async () => {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      },
    }),
    () => true,
  );
  // wechat threshold default 5; one failure recorded.
  assert.equal(registry.getCircuitBreaker().getFailureCount('wechat'), 1);
});

test('T2.7 11: success records circuit success (resets counter)', async () => {
  const registry = buildRegistry();
  const circuit = registry.getCircuitBreaker();
  const service = new PaymentExecutionService(registry);
  // pre-seed one failure
  circuit.recordFailure('wechat', err(PaymentErrorCode.NETWORK_ERROR, true));
  assert.equal(circuit.getFailureCount('wechat'), 1);
  await service.execute(PaymentOperation.QUERY_ORDER, {
    operation: async () => ({ orderId: 'o11', status: 'PAID' as const }),
  });
  assert.equal(circuit.getFailureCount('wechat'), 0);
});

test('T2.7 12: OPEN provider is skipped by the registry', async () => {
  const registry = buildRegistry();
  registry.getCircuitBreaker().configure('wechat', { threshold: 1, openMs: 60000 });
  registry.getCircuitBreaker().recordFailure('wechat', err(PaymentErrorCode.NETWORK_ERROR, true));
  const service = new PaymentExecutionService(registry);
  let selected: string | undefined;
  await service.execute(PaymentOperation.QUERY_ORDER, {
    operation: async (provider, attempt) => {
      selected = attempt.providerName;
      return { orderId: 'o12', status: 'PENDING' as const };
    },
  });
  assert.equal(selected, 'alipay'); // wechat OPEN → skipped
});

/* ------------------------------------------------------------------ */
/* Idempotency                                                         */
/* ------------------------------------------------------------------ */

test('T2.7 13: CREATE_ORDER without idempotency key refuses auto-retry', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  await assert.rejects(
    service.execute(PaymentOperation.CREATE_ORDER, {
      operation: async () => createOrderResult('o13'),
    }),
    (e: unknown) =>
      e instanceof PaymentError &&
      e.code === PaymentErrorCode.FATAL_ERROR &&
      /requires idempotency key/.test(e.message),
  );
});

test('T2.7 14: REFUND without idempotency key refuses auto-retry', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  await assert.rejects(
    service.execute(PaymentOperation.REFUND, {
      operation: async () => ({ refundId: 'r14', providerRefundId: 'p', status: 'PENDING' as const }),
    }),
    (e: unknown) =>
      e instanceof PaymentError &&
      e.code === PaymentErrorCode.FATAL_ERROR &&
      /requires idempotency key/.test(e.message),
  );
});

test('T2.7 15: CREATE_ORDER retries keep the same idempotency key', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  const keys: Array<string | undefined> = [];
  await service.execute(PaymentOperation.CREATE_ORDER, {
    idempotencyKey: 'key-15',
    operation: async (provider, attempt) => {
      keys.push(attempt.idempotencyKey);
      if (attempt.attempt === 0) {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      }
      return createOrderResult('o15');
    },
  });
  assert.equal(keys.length, 2);
  assert.equal(keys[0], 'key-15');
  assert.equal(keys[1], 'key-15'); // never regenerated
});

test('T2.7 16: REFUND retries keep the same idempotency key', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  const keys: Array<string | undefined> = [];
  await service.execute(PaymentOperation.REFUND, {
    idempotencyKey: 'key-16',
    operation: async (provider, attempt) => {
      keys.push(attempt.idempotencyKey);
      if (attempt.attempt === 0) {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      }
      return { refundId: 'r16', providerRefundId: 'p', status: 'SUCCEEDED' as const };
    },
  });
  assert.equal(keys[0], 'key-16');
  assert.equal(keys[1], 'key-16');
});

/* ------------------------------------------------------------------ */
/* Failover                                                            */
/* ------------------------------------------------------------------ */

test('T2.7 17: retry exhausted then fails over to the backup provider', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  const seen: string[] = [];
  const result = await service.execute(PaymentOperation.CREATE_ORDER, {
    idempotencyKey: 'key-17',
    retryConfig: {
      policy: RetryPolicy.CONFIGURABLE,
      maxAttempts: 1,
      baseDelayMs: 1,
      maxDelayMs: 4,
      jitter: false,
    },
    operation: async (provider, attempt) => {
      seen.push(attempt.providerName);
      if (attempt.providerName === 'wechat') {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      }
      return createOrderResult('o17');
    },
  });
  assert.equal(seen.includes('wechat'), true);
  assert.equal(seen.includes('alipay'), true);
  assert.equal(result.orderId, 'o17');
});

test('T2.7 18: BUSINESS_ERROR never fails over', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  const seen: string[] = [];
  await assert.rejects(
    service.execute(PaymentOperation.CREATE_ORDER, {
      idempotencyKey: 'key-18',
      retryConfig: { policy: RetryPolicy.CONFIGURABLE, maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 4, jitter: false },
      operation: async (provider, attempt) => {
        seen.push(attempt.providerName);
        throw err(PaymentErrorCode.BUSINESS_ERROR);
      },
    }),
    (e: unknown) => e instanceof PaymentError && e.code === PaymentErrorCode.BUSINESS_ERROR,
  );
  assert.deepEqual(seen, ['wechat']); // never moved to alipay
});

test('T2.7 19: UNKNOWN_SIDE_EFFECT never fails over', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  const seen: string[] = [];
  await assert.rejects(
    service.execute(PaymentOperation.CREATE_ORDER, {
      idempotencyKey: 'key-19',
      operation: async (provider, attempt) => {
        seen.push(attempt.providerName);
        throw err(PaymentErrorCode.UNKNOWN_SIDE_EFFECT);
      },
    }),
    (e: unknown) => e instanceof PaymentError && e.code === PaymentErrorCode.UNKNOWN_SIDE_EFFECT,
  );
  assert.deepEqual(seen, ['wechat']);
});

test('T2.7 20: CREATE_ORDER timeout (unknown outcome) does not switch provider', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  const seen: string[] = [];
  await assert.rejects(
    service.execute(PaymentOperation.CREATE_ORDER, {
      idempotencyKey: 'key-20',
      operation: async (provider, attempt) => {
        seen.push(attempt.providerName);
        // simulate request sent, response timed out → outcome unknown
        throw err(PaymentErrorCode.UNKNOWN_SIDE_EFFECT);
      },
    }),
    () => true,
  );
  assert.deepEqual(seen, ['wechat']); // no second payment created at alipay
});

/* ------------------------------------------------------------------ */
/* Provider identity                                                   */
/* ------------------------------------------------------------------ */

test('T2.7 21: retry keeps the same provider', async () => {
  const service = new PaymentExecutionService(buildRegistry());
  const seen: string[] = [];
  await service.execute(PaymentOperation.QUERY_ORDER, {
    operation: async (provider, attempt) => {
      seen.push(attempt.providerName);
      if (attempt.attempt === 0) {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      }
      return { orderId: 'o21', status: 'PAID' as const };
    },
  });
  assert.deepEqual(seen, ['wechat', 'wechat']); // never rotated
});

test('T2.7 22: provider switches only via failover after retry exhausted', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  const seen: string[] = [];
  const result = await service.execute(PaymentOperation.CREATE_ORDER, {
    idempotencyKey: 'key-22',
    retryConfig: { policy: RetryPolicy.CONFIGURABLE, maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 4, jitter: false },
    operation: async (provider, attempt) => {
      seen.push(attempt.providerName);
      if (attempt.providerName === 'wechat') {
        throw err(PaymentErrorCode.NETWORK_ERROR, true);
      }
      return createOrderResult('o22');
    },
  });
  // wechat: attempt 0 + retry attempt 1, then failover to alipay.
  assert.deepEqual(seen, ['wechat', 'wechat', 'alipay']);
  assert.equal(result.orderId, 'o22');
});

/* ------------------------------------------------------------------ */
/* Matrix / boundary guards                                            */
/* ------------------------------------------------------------------ */

test('T2.7 23: CLOSE_ORDER / VERIFY_WEBHOOK never auto-retry or failover', async () => {
  const registry = buildRegistry();
  const service = new PaymentExecutionService(registry);
  for (const op of [PaymentOperation.CLOSE_ORDER, PaymentOperation.VERIFY_WEBHOOK]) {
    let calls = 0;
    await assert.rejects(
      service.execute(op, {
        operation: async () => {
          calls += 1;
          throw err(PaymentErrorCode.NETWORK_ERROR, true);
        },
      }),
      (e: unknown) => e instanceof PaymentError && e.code === PaymentErrorCode.NETWORK_ERROR,
    );
    assert.equal(calls, 1, `${op} must not retry`);
  }
});

test('T2.7 24: no provider available → PROVIDER_NOT_AVAILABLE', async () => {
  const registry = new PaymentProviderRegistry(); // nothing registered
  const service = new PaymentExecutionService(registry);
  await assert.rejects(
    service.execute(PaymentOperation.QUERY_ORDER, {
      operation: async () => ({ orderId: 'x', status: 'PENDING' as const }),
    }),
    (e: unknown) =>
      e instanceof PaymentError && e.code === PaymentErrorCode.PROVIDER_NOT_AVAILABLE,
  );
});
