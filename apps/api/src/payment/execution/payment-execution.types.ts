/**
 * T2.7 — Payment Execution Domain Types (provider-independent).
 *
 * Defines the unified execution vocabulary used by PaymentExecutionService.
 * PaymentService expresses business intent via PaymentOperation; all
 * provider selection / retry / circuit / failover / idempotency concerns
 * live inside the execution boundary.
 *
 * No SDK / HTTP / provider-specific code appears here.
 */
import { PaymentFeature } from '../domain/payment.enums';
import { RetryPolicyConfig } from '../domain/payment.policy';
import { PaymentProvider } from '../providers/payment-provider.interface';

/** Business payment operations (NOT provider names). */
export enum PaymentOperation {
  CREATE_ORDER = 'CREATE_ORDER',
  QUERY_ORDER = 'QUERY_ORDER',
  CLOSE_ORDER = 'CLOSE_ORDER',
  REFUND = 'REFUND',
  QUERY_REFUND = 'QUERY_REFUND',
  VERIFY_WEBHOOK = 'VERIFY_WEBHOOK',
}

/**
 * Idempotency context for a single business operation.
 *
 * Scope = tenant + operation + idempotencyKey.
 * The SAME idempotencyKey MUST be reused across retries of one operation —
 * never regenerate it inside a retry loop.
 *
 * Database persistence is out of scope for T2.7 (foundation only).
 */
export interface PaymentIdempotencyContext {
  readonly idempotencyKey: string;
  readonly operation: PaymentOperation;
  readonly tenantId?: string;
  readonly merchantOrderId?: string;
  /** Provider pinned by the caller (optional; normally selected by registry). */
  readonly providerName?: string;
}

/** Per-attempt context handed to the operation callback. */
export interface PaymentExecutionAttempt {
  /** 0-based attempt counter (0 = first try). */
  readonly attempt: number;
  readonly operation: PaymentOperation;
  readonly providerName: string;
  readonly idempotencyKey?: string;
}

/**
 * Retry safety per operation (Design Freeze v1 + T2.7 matrix).
 *
 * retry:
 *   always       — may retry under retry policy
 *   conditional  — retry only when an idempotency key is present
 *   never        — no automatic retry in the execution boundary
 *
 * idempotencyRequired — operation must carry an idempotencyKey
 *                       before automatic retry is allowed.
 */
export interface OperationRetrySafety {
  readonly retry: 'always' | 'conditional' | 'never';
  readonly idempotencyRequired: boolean;
}

/** T2.7 Retry Safety Matrix (frozen). */
export const RETRY_SAFETY_MATRIX: Readonly<Record<PaymentOperation, OperationRetrySafety>> = {
  [PaymentOperation.CREATE_ORDER]: { retry: 'conditional', idempotencyRequired: true },
  [PaymentOperation.QUERY_ORDER]: { retry: 'always', idempotencyRequired: false },
  // CLOSE_ORDER: provider semantics for safe retry are not unified yet —
  // default to NO automatic retry in the execution boundary.
  [PaymentOperation.CLOSE_ORDER]: { retry: 'never', idempotencyRequired: false },
  [PaymentOperation.REFUND]: { retry: 'conditional', idempotencyRequired: true },
  [PaymentOperation.QUERY_REFUND]: { retry: 'always', idempotencyRequired: false },
  // VERIFY_WEBHOOK: signature verification must not be auto-retried.
  [PaymentOperation.VERIFY_WEBHOOK]: { retry: 'never', idempotencyRequired: false },
};

export function getRetrySafety(operation: PaymentOperation): OperationRetrySafety {
  return RETRY_SAFETY_MATRIX[operation];
}

/**
 * Unified execution options.
 *
 * `operation` callback receives the selected provider and the attempt
 * context; the boundary is provider-independent and never branches on
 * provider names.
 */
export interface PaymentExecutionOptions<T> {
  readonly idempotencyKey?: string;
  readonly tenantId?: string;
  readonly merchantOrderId?: string;
  /** Optional feature filter forwarded to registry selection. */
  readonly feature?: PaymentFeature;
  /** Retry policy config; defaults to frozen CONFIGURABLE/3/500/8000/jitter. */
  readonly retryConfig?: RetryPolicyConfig;
  /** Optional pinned provider (bypasses registry selection). */
  readonly providerName?: string;
  /** The provider operation to execute. */
  readonly operation: (
    provider: PaymentProvider,
    attempt: PaymentExecutionAttempt,
  ) => Promise<T>;
}

/** Convenience: build the idempotency context for an operation. */
export function buildIdempotencyContext(
  operation: PaymentOperation,
  options: Pick<PaymentExecutionOptions<unknown>, 'idempotencyKey' | 'tenantId' | 'merchantOrderId' | 'providerName'>,
): PaymentIdempotencyContext | undefined {
  if (!options.idempotencyKey) {
    return undefined;
  }
  return {
    idempotencyKey: options.idempotencyKey,
    operation,
    tenantId: options.tenantId,
    merchantOrderId: options.merchantOrderId,
    providerName: options.providerName,
  };
}
