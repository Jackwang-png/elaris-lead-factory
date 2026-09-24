/**
 * T2.3/T2.4 — Payment domain types (Design Freeze v1).
 *
 * FROZEN ProviderHealth — do NOT modify this shape.
 * healthCheck() MUST return exactly this structure.
 *
 * SINGLE SOURCE OF TRUTH for ProviderConfig — the PaymentProvider
 * interface and every provider adapter MUST import it from here.
 */
import { HealthStatus } from './payment.enums';

export interface ProviderHealth {
  readonly status: HealthStatus;
  readonly lastCheckedAt: Date;
  readonly latencyMs: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* ProviderConfig (single source of truth)                             */
/* ------------------------------------------------------------------ */

/** Retry policy for provider channel calls. */
export interface ProviderRetryConfig {
  readonly policy: string;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: boolean;
}

/** Circuit breaker policy for provider channel calls. */
export interface ProviderCircuitBreakerConfig {
  readonly threshold: number;
  readonly openMs: number;
}

/** Webhook callback config for a provider channel. */
export interface ProviderWebhookConfig {
  readonly url: string;
  readonly secretEnv: string;
}

/**
 * Strongly-typed base config, injected via constructor.
 * Providers never read process.env directly and never hardcode secrets.
 * Secrets are not persisted to the database.
 */
export interface ProviderConfig {
  /** Channel key, e.g. 'wechat' | 'alipay' | 'stripe'. */
  readonly provider: string;
  readonly environment: 'sandbox' | 'production';
  /** Master switch — only enabled providers participate in routing. */
  readonly enabled: boolean;
  /** Routing precedence (higher = preferred first). */
  readonly priority?: number;
  readonly sandbox?: boolean;
  readonly timeoutMs?: number;
  readonly retry?: ProviderRetryConfig;
  readonly circuitBreaker?: ProviderCircuitBreakerConfig;
  readonly webhook?: ProviderWebhookConfig;
  /** Public callback URL for channel notifications. */
  readonly notifyUrl?: string;
}
