/**
 * T2.5 — Provider Error Mapping + Retry Policy tests.
 *
 * Uses Node's built-in node:test runner — no new test infrastructure.
 * Run: npx ts-node src/payment/providers/provider-error-policy.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PaymentError,
  PaymentErrorCode,
} from '../domain/payment.errors';
import {
  calculateRetryDelay,
  DEFAULT_RETRY_POLICY_CONFIG,
  isRetryableError,
  policyError,
  RetryPolicy,
  RetryPolicyConfig,
} from '../domain/payment.policy';
import { mapWechatError, WECHAT_PAY_ERROR_MAP } from './wechat/wechat-pay.error-map';
import { mapAlipayError, ALIPAY_ERROR_MAP } from './alipay/alipay.error-map';
import { mapStripeError, STRIPE_ERROR_MAP } from './stripe/stripe.error-map';

/* ------------------------------------------------------------------ */
/* A. Error Mapping — frozen codes                                     */
/* ------------------------------------------------------------------ */

test('T2.5 A: WeChat frozen error codes map correctly', () => {
  const cases: Array<[string, PaymentErrorCode, boolean]> = [
    ['SYSTEMERROR', PaymentErrorCode.PROVIDER_ERROR, true],
    ['ORDERNOTEXIST', PaymentErrorCode.PROVIDER_ERROR, false],
    ['USERPAYING', PaymentErrorCode.RETRYABLE_ERROR, true],
    ['TRADE_STATE_ERROR', PaymentErrorCode.BUSINESS_ERROR, false],
  ];
  for (const [code, expected, retryable] of cases) {
    const err = mapWechatError(code);
    assert.ok(err instanceof PaymentError);
    assert.equal(err.code, expected);
    assert.equal(err.retryable, retryable);
    assert.equal(err.mappedFrom, code);
  }
});

test('T2.5 A: Alipay frozen error codes map correctly', () => {
  const cases: Array<[string, PaymentErrorCode, boolean]> = [
    ['ACQ.SYSTEM_ERROR', PaymentErrorCode.PROVIDER_ERROR, true],
    ['ACQ.TRADE_NOT_EXIST', PaymentErrorCode.PROVIDER_ERROR, false],
    ['ACQ.TRADE_STATUS_ERROR', PaymentErrorCode.BUSINESS_ERROR, false],
  ];
  for (const [code, expected, retryable] of cases) {
    const err = mapAlipayError(code);
    assert.ok(err instanceof PaymentError);
    assert.equal(err.code, expected);
    assert.equal(err.retryable, retryable);
    assert.equal(err.mappedFrom, code);
  }
});

test('T2.5 A: Stripe frozen error types map correctly', () => {
  const cases: Array<[string, PaymentErrorCode, boolean]> = [
    ['api_error', PaymentErrorCode.RETRYABLE_ERROR, true],
    ['card_error', PaymentErrorCode.BUSINESS_ERROR, false],
    ['invalid_request_error', PaymentErrorCode.BUSINESS_ERROR, false],
  ];
  for (const [code, expected, retryable] of cases) {
    const err = mapStripeError(code);
    assert.ok(err instanceof PaymentError);
    assert.equal(err.code, expected);
    assert.equal(err.retryable, retryable);
    assert.equal(err.mappedFrom, code);
  }
});

/* ------------------------------------------------------------------ */
/* B. Unknown Error                                                    */
/* ------------------------------------------------------------------ */

test('T2.5 B: unknown channel codes map to PROVIDER_ERROR with mappedFrom preserved', () => {
  const mappers = [mapWechatError, mapAlipayError, mapStripeError];
  const unknownCode = 'UNKNOWN_CHANNEL_CODE_XYZ';
  for (const mapError of mappers) {
    const err = mapError(unknownCode);
    assert.ok(err instanceof PaymentError);
    assert.equal(err.code, PaymentErrorCode.PROVIDER_ERROR);
    assert.equal(err.retryable, false);
    assert.equal(err.mappedFrom, unknownCode);
  }
});

test('T2.5 B: map functions accept message and cause', () => {
  const cause = new Error('raw channel failure');
  const err = mapWechatError('SYSTEMERROR', 'custom message', cause);
  assert.equal(err.message, 'custom message');
  assert.equal(err.cause, cause);
  assert.equal(err.code, PaymentErrorCode.PROVIDER_ERROR);
});

test('T2.5 B: error maps contain exactly the frozen entries', () => {
  assert.deepEqual(Object.keys(WECHAT_PAY_ERROR_MAP).sort(), [
    'ORDERNOTEXIST',
    'SYSTEMERROR',
    'TRADE_STATE_ERROR',
    'USERPAYING',
  ]);
  assert.deepEqual(Object.keys(ALIPAY_ERROR_MAP).sort(), [
    'ACQ.SYSTEM_ERROR',
    'ACQ.TRADE_NOT_EXIST',
    'ACQ.TRADE_STATUS_ERROR',
  ]);
  assert.deepEqual(Object.keys(STRIPE_ERROR_MAP).sort(), [
    'api_error',
    'card_error',
    'invalid_request_error',
  ]);
});

/* ------------------------------------------------------------------ */
/* C. Retry Policy Decision Matrix                                     */
/* ------------------------------------------------------------------ */

const noJitterConfig = (policy: RetryPolicy): RetryPolicyConfig => ({
  policy,
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  jitter: false,
});

const policyConfigs: Array<[string, RetryPolicy]> = [
  ['NEVER', RetryPolicy.NEVER],
  ['ALWAYS', RetryPolicy.ALWAYS],
  ['NETWORK_ONLY', RetryPolicy.NETWORK_ONLY],
  ['PROVIDER_ONLY', RetryPolicy.PROVIDER_ONLY],
  ['CONFIGURABLE', RetryPolicy.CONFIGURABLE],
];

const errorCodes = [
  PaymentErrorCode.NETWORK_ERROR,
  PaymentErrorCode.PROVIDER_ERROR,
  PaymentErrorCode.RETRYABLE_ERROR,
  PaymentErrorCode.BUSINESS_ERROR,
  PaymentErrorCode.FATAL_ERROR,
] as const;

test('T2.5 C: NEVER — no error is retryable', () => {
  const config = noJitterConfig(RetryPolicy.NEVER);
  for (const code of errorCodes) {
    assert.equal(isRetryableError(policyError(code, false), config), false, code);
    assert.equal(isRetryableError(policyError(code, true), config), false, `${code} retryable flag`);
  }
});

test('T2.5 C: ALWAYS — every error is retryable (bounded by maxAttempts)', () => {
  const config = noJitterConfig(RetryPolicy.ALWAYS);
  for (const code of errorCodes) {
    assert.equal(isRetryableError(policyError(code, false), config), true, code);
  }
  // maxAttempts bound: attempt >= maxAttempts → false
  assert.equal(
    isRetryableError(policyError(PaymentErrorCode.PROVIDER_ERROR, false), config, 3),
    false,
  );
});

test('T2.5 C: NETWORK_ONLY — only NETWORK_ERROR is retryable', () => {
  const config = noJitterConfig(RetryPolicy.NETWORK_ONLY);
  for (const code of errorCodes) {
    const expected = code === PaymentErrorCode.NETWORK_ERROR;
    assert.equal(isRetryableError(policyError(code, true), config), expected, code);
  }
});

test('T2.5 C: PROVIDER_ONLY — only PROVIDER_ERROR is retryable', () => {
  const config = noJitterConfig(RetryPolicy.PROVIDER_ONLY);
  for (const code of errorCodes) {
    const expected = code === PaymentErrorCode.PROVIDER_ERROR;
    assert.equal(isRetryableError(policyError(code, true), config), expected, code);
  }
});

test('T2.5 C: CONFIGURABLE — only error.retryable === true is retryable', () => {
  const config = noJitterConfig(RetryPolicy.CONFIGURABLE);
  for (const code of errorCodes) {
    assert.equal(isRetryableError(policyError(code, true), config), true, code);
    assert.equal(isRetryableError(policyError(code, false), config), false, code);
  }
});

test('T2.5 C: maxAttempts bounds every policy', () => {
  for (const [, policy] of policyConfigs) {
    const config = noJitterConfig(policy);
    // NETWORK_ONLY/PROVIDER_ONLY/CONFIGURABLE with matching error, attempt == maxAttempts → false
    const probe =
      policy === RetryPolicy.NETWORK_ONLY
        ? policyError(PaymentErrorCode.NETWORK_ERROR, true)
        : policy === RetryPolicy.PROVIDER_ONLY
          ? policyError(PaymentErrorCode.PROVIDER_ERROR, true)
          : policyError(PaymentErrorCode.RETRYABLE_ERROR, true);
    assert.equal(isRetryableError(probe, config, config.maxAttempts), false, policy);
  }
});

/* ------------------------------------------------------------------ */
/* D. Retry Delay (exponential backoff)                                */
/* ------------------------------------------------------------------ */

test('T2.5 D: exponential backoff without jitter', () => {
  const config: RetryPolicyConfig = {
    ...DEFAULT_RETRY_POLICY_CONFIG,
    jitter: false,
    baseDelayMs: 500,
    maxDelayMs: 8000,
  };
  // delay = min(500 * 2^attempt, 8000)
  assert.equal(calculateRetryDelay(0, config), 500);
  assert.equal(calculateRetryDelay(1, config), 1000);
  assert.equal(calculateRetryDelay(2, config), 2000);
  assert.equal(calculateRetryDelay(3, config), 4000);
  assert.equal(calculateRetryDelay(4, config), 8000); // capped
  assert.equal(calculateRetryDelay(10, config), 8000); // stays capped
});

test('T2.5 D: jitter stays within bounds and never exceeds maxDelayMs', () => {
  const config: RetryPolicyConfig = {
    ...DEFAULT_RETRY_POLICY_CONFIG,
    jitter: true,
    baseDelayMs: 500,
    maxDelayMs: 8000,
  };
  for (let i = 0; i < 50; i++) {
    for (const attempt of [0, 1, 2, 3, 4, 5, 10]) {
      const delay = calculateRetryDelay(attempt, config);
      assert.ok(delay <= config.maxDelayMs, `attempt ${attempt} delay ${delay} <= ${config.maxDelayMs}`);
      assert.ok(delay > 0, `attempt ${attempt} delay positive`);
      // lower bound: >= 0.5 * min(base*2^attempt, max) minus floor rounding
      const base = Math.min(500 * Math.pow(2, attempt), 8000);
      assert.ok(delay >= Math.floor(base * 0.5), `attempt ${attempt} delay ${delay} >= half base ${base}`);
    }
  }
});

test('T2.5 D: default config uses frozen defaults', () => {
  assert.equal(DEFAULT_RETRY_POLICY_CONFIG.policy, RetryPolicy.CONFIGURABLE);
  assert.equal(DEFAULT_RETRY_POLICY_CONFIG.maxAttempts, 3);
  assert.equal(DEFAULT_RETRY_POLICY_CONFIG.baseDelayMs, 500);
  assert.equal(DEFAULT_RETRY_POLICY_CONFIG.maxDelayMs, 8000);
  assert.equal(DEFAULT_RETRY_POLICY_CONFIG.jitter, true);
});
