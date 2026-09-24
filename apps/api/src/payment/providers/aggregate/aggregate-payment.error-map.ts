/**
 * T2.9 — Aggregate Payment channel error mapping.
 *
 * The aggregate platform (e.g. MaPay) error codes are UNKNOWN until the
 * official API documentation is provided. This file establishes the mapping
 * boundary: any raw channel code → domain PaymentError.
 *
 * Unknown channel codes fall back to PROVIDER_ERROR and preserve `mappedFrom`.
 * When the platform contract lands, only this file needs to change.
 */
import { PaymentErrorCode, PaymentError } from '../../domain/payment.errors';

export interface MappedChannelError {
  readonly code: PaymentErrorCode;
  readonly retryable: boolean;
  readonly mappedFrom: string;
}

/**
 * Aggregate platform known error codes (design-freeze base mapping).
 * Empty until the official API docs define the real error vocabulary.
 */
export const AGGREGATE_ERROR_MAP: Readonly<Record<string, MappedChannelError>> = {
  // e.g. 'SYSTEM_ERROR': { code: PaymentErrorCode.PROVIDER_ERROR, retryable: true, mappedFrom: 'SYSTEM_ERROR' },
};

/**
 * Map a raw aggregate platform error code to a PaymentError.
 * Unknown codes → PROVIDER_ERROR (retryable=false) with `mappedFrom` preserved.
 * Never throws the raw provider error.
 */
export function mapAggregateError(
  code: string,
  message?: string,
  cause?: unknown,
): PaymentError {
  const mapped = AGGREGATE_ERROR_MAP[code] ?? {
    code: PaymentErrorCode.PROVIDER_ERROR,
    retryable: false,
    mappedFrom: code,
  };
  return new PaymentError(message ?? `Aggregate payment error: ${code}`, {
    code: mapped.code,
    retryable: mapped.retryable,
    provider: 'aggregate',
    mappedFrom: code,
    cause,
  });
}
