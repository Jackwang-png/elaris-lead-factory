/**
 * T2.5 — Retry Policy (Domain, provider-independent).
 *
 * Pure logic only: retry decision + exponential backoff delay calculation.
 * No sleep, no setTimeout, no network, no SDK dependency.
 *
 * PaymentService must never see provider-specific error codes — it only
 * consumes PaymentError / PaymentErrorCode + this policy layer.
 */
import { PaymentError, PaymentErrorCode } from './payment.errors';

/** Frozen retry policy (Design Freeze v1). */
export enum RetryPolicy {
  NEVER = 'NEVER',
  ALWAYS = 'ALWAYS',
  NETWORK_ONLY = 'NETWORK_ONLY',
  PROVIDER_ONLY = 'PROVIDER_ONLY',
  CONFIGURABLE = 'CONFIGURABLE',
}

export interface RetryPolicyConfig {
  readonly policy: RetryPolicy;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: boolean;
}

/** Default retry policy config (Design Freeze v1 defaults). */
export const DEFAULT_RETRY_POLICY_CONFIG: RetryPolicyConfig = {
  policy: RetryPolicy.CONFIGURABLE,
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  jitter: true,
};

/**
 * Decide whether an error is retryable under the given policy.
 * `attempt` is 0-based (0 = first try already failed).
 *
 * Retry Decision Matrix (Design Freeze v1):
 *   NEVER          → any error → false
 *   ALWAYS         → any error → true (bounded by maxAttempts)
 *   NETWORK_ONLY   → only PaymentErrorCode.NETWORK_ERROR → true
 *   PROVIDER_ONLY  → only PaymentErrorCode.PROVIDER_ERROR → true
 *   CONFIGURABLE   → only error.retryable === true → true
 *   other          → false
 */
export function isRetryableError(
  error: PaymentError,
  config: RetryPolicyConfig,
  attempt = 0,
): boolean {
  if (attempt >= config.maxAttempts) {
    return false;
  }
  switch (config.policy) {
    case RetryPolicy.NEVER:
      return false;
    case RetryPolicy.ALWAYS:
      return true;
    case RetryPolicy.NETWORK_ONLY:
      return error.code === PaymentErrorCode.NETWORK_ERROR;
    case RetryPolicy.PROVIDER_ONLY:
      return error.code === PaymentErrorCode.PROVIDER_ERROR;
    case RetryPolicy.CONFIGURABLE:
      return error.retryable === true;
    default:
      return false;
  }
}

/**
 * Exponential backoff delay (pure function, no sleeping).
 *
 *   delay = min(baseDelayMs * 2^attempt, maxDelayMs)
 *
 * When jitter === true a random factor in [0.5, 1.0] is applied.
 * Result is always clamped to maxDelayMs.
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryPolicyConfig,
): number {
  const base = Math.min(
    config.baseDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  if (!config.jitter) {
    return Math.floor(base);
  }
  const jittered = base * (0.5 + Math.random() * 0.5);
  return Math.min(Math.floor(jittered), config.maxDelayMs);
}

/** Construct a PaymentError for policy tests / domain use. */
export function policyError(
  code: PaymentErrorCode,
  retryable = false,
  provider = 'test',
): PaymentError {
  return new PaymentError(`policy test error: ${code}`, {
    code,
    retryable,
    provider,
  });
}
