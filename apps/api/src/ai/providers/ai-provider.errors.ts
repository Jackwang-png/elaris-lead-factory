/**
 * P0-5B.1 — AIError / AIErrorCode.
 *
 * SINGLE SOURCE OF TRUTH for all AI provider errors (mirrors the payment
 * domain discipline in src/payment/domain/payment.errors.ts).
 * All provider adapters MUST import from here — no duplicate AIError class
 * may exist anywhere else in the codebase.
 *
 * Normalization contract (requirement 11):
 *   - SDK / HTTP errors from provider SDKs are mapped by the adapter into
 *     these codes. Raw SDK errors NEVER leak to business services.
 *   - 401/403            → AI_AUTH_ERROR
 *   - 429                → AI_RATE_LIMITED
 *   - timeout / abort    → AI_TIMEOUT
 *   - 5xx / other        → AI_PROVIDER_ERROR
 *   - invalid structured output (parse/schema) → AI_INVALID_OUTPUT
 *     (returned as AIResult.success=false, NOT thrown — the transport call
 *     itself succeeded, only the payload is unusable)
 *   - missing/misconfigured provider credentials → AI_CONFIGURATION_ERROR
 *   - requested provider not registered / no provider available → AI_PROVIDER_NOT_AVAILABLE
 */
export enum AIErrorCode {
  /** Provider rejected credentials (401 / 403). */
  AI_AUTH_ERROR = 'AI_AUTH_ERROR',
  /** Provider rate limited (429). */
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',
  /** Request timed out (AbortError / ETIMEDOUT / 408). */
  AI_TIMEOUT = 'AI_TIMEOUT',
  /** Provider-side failure (5xx / transport / unknown SDK error). */
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  /** Structured output failed parse or schema validation. */
  AI_INVALID_OUTPUT = 'AI_INVALID_OUTPUT',
  /** Missing / invalid provider configuration (credentials, schema…). */
  AI_CONFIGURATION_ERROR = 'AI_CONFIGURATION_ERROR',
  /** No AI provider registered / requested name not found. */
  AI_PROVIDER_NOT_AVAILABLE = 'AI_PROVIDER_NOT_AVAILABLE',
}

export interface AIErrorOptions {
  readonly code: AIErrorCode;
  /** Provider key, e.g. 'openai' | 'deepseek'. */
  readonly provider?: string;
  /** Whether a retry may help (rate limit / 5xx / timeout). */
  readonly retryable?: boolean;
  readonly cause?: unknown;
}

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly provider: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, options: AIErrorOptions) {
    super(message);
    this.name = 'AIError';
    this.code = options.code;
    this.provider = options.provider ?? 'unknown';
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;
  }

  /** No usable AI provider available (Null/Unknown fallback). */
  static providerNotAvailable(
    provider: string,
    method: string,
    reason?: string,
  ): AIError {
    return new AIError(
      reason ?? `[${provider}] ${method}(): no available AI provider`,
      {
        code: AIErrorCode.AI_PROVIDER_NOT_AVAILABLE,
        provider,
        retryable: false,
      },
    );
  }

  /** Invalid or missing provider configuration. */
  static configurationError(
    provider: string,
    method: string,
    reason: string,
  ): AIError {
    return new AIError(`[${provider}] ${method}(): ${reason}`, {
      code: AIErrorCode.AI_CONFIGURATION_ERROR,
      provider,
      retryable: false,
    });
  }
}
