/**
 * T2.5 — Stripe channel error type → PaymentErrorCode mapping
 * (Design Freeze v1 base set).
 *
 * Unknown channel codes fall back to PROVIDER_ERROR and preserve `mappedFrom`.
 */
import { PaymentErrorCode, PaymentError } from '../../domain/payment.errors';

export interface MappedChannelError {
  readonly code: PaymentErrorCode;
  readonly retryable: boolean;
  readonly mappedFrom: string;
}

/** Stripe API error types (design-freeze base mapping). */
export const STRIPE_ERROR_MAP: Readonly<Record<string, MappedChannelError>> = {
  api_error: { code: PaymentErrorCode.RETRYABLE_ERROR, retryable: true, mappedFrom: 'api_error' },
  card_error: { code: PaymentErrorCode.BUSINESS_ERROR, retryable: false, mappedFrom: 'card_error' },
  invalid_request_error: { code: PaymentErrorCode.BUSINESS_ERROR, retryable: false, mappedFrom: 'invalid_request_error' },
};

/**
 * Map a raw Stripe error type to a PaymentError.
 * Unknown codes → PROVIDER_ERROR (retryable=false) with `mappedFrom` preserved.
 * Never throws the raw provider error.
 */
export function mapStripeError(
  code: string,
  message?: string,
  cause?: unknown,
): PaymentError {
  const mapped = STRIPE_ERROR_MAP[code] ?? {
    code: PaymentErrorCode.PROVIDER_ERROR,
    retryable: false,
    mappedFrom: code,
  };
  return new PaymentError(message ?? `Stripe error: ${code}`, {
    code: mapped.code,
    retryable: mapped.retryable,
    provider: 'stripe',
    mappedFrom: code,
    cause,
  });
}
