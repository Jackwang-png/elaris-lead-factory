/**
 * T2.3 — PaymentError / PaymentErrorCode.
 *
 * SINGLE SOURCE OF TRUTH for all payment errors (Design Freeze v1).
 * All provider adapters MUST import from here — no duplicate PaymentError
 * class may exist anywhere else in the codebase.
 */

/** Domain-level error codes (Design Freeze v1 base set). */
export enum PaymentErrorCode {
  /** Channel reported a provider-side error (5xx / system error). */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Network-level failure (connectivity / transport). */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Operation failed but is safe to retry later. */
  RETRYABLE_ERROR = 'RETRYABLE_ERROR',
  /** Business-level rejection (bad state / invalid request semantics). */
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  /** Non-recoverable fatal failure. */
  FATAL_ERROR = 'FATAL_ERROR',
  /** Skeleton placeholder: capability declared but not implemented yet. */
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  /** No usable payment provider available (Null/Unknown fallback). */
  PROVIDER_NOT_AVAILABLE = 'PROVIDER_NOT_AVAILABLE',
  /**
   * Channel outcome is unknown — the provider may have applied the
   * side effect (e.g. order/refund created) before a timeout. Never
   * blindly retry or failover on this code.
   */
  UNKNOWN_SIDE_EFFECT = 'UNKNOWN_SIDE_EFFECT',
}

export interface PaymentErrorOptions {
  readonly code: PaymentErrorCode;
  readonly retryable?: boolean;
  /** Provider key, e.g. 'wechat' | 'alipay' | 'stripe'. */
  readonly provider?: string;
  /** Original channel error code when mapped from a channel error. */
  readonly mappedFrom?: string;
  readonly cause?: unknown;
}

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  readonly retryable: boolean;
  readonly provider: string;
  readonly mappedFrom?: string;
  readonly cause?: unknown;

  constructor(message: string, options: PaymentErrorOptions) {
    super(message);
    this.name = 'PaymentError';
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.provider = options.provider ?? 'unknown';
    this.mappedFrom = options.mappedFrom;
    this.cause = options.cause;
  }

  /**
   * Terminate a declared-but-unimplemented capability in an explicit,
   * structured way. Used by all provider skeletons in T2.3.
   */
  static notImplemented(provider: string, method: string): PaymentError {
    return new PaymentError(
      `[${provider}] ${method}() is not implemented yet (T2.3 skeleton)`,
      {
        code: PaymentErrorCode.NOT_IMPLEMENTED,
        provider,
        retryable: false,
      },
    );
  }

  /**
   * Terminate an operation when no usable payment provider is available
   * (NullPaymentProvider) or the requested provider does not exist
   * (UnknownPaymentProvider).
   */
  static providerNotAvailable(
    provider: string,
    method: string,
    reason?: string,
  ): PaymentError {
    return new PaymentError(
      reason ?? `[${provider}] ${method}(): no available payment provider`,
      {
        code: PaymentErrorCode.PROVIDER_NOT_AVAILABLE,
        provider,
        retryable: false,
      },
    );
  }
}
