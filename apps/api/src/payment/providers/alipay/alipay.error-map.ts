/**
 * T2.5 — Alipay channel error code → PaymentErrorCode mapping
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

/** Alipay open API known error codes (design-freeze base mapping). */
export const ALIPAY_ERROR_MAP: Readonly<Record<string, MappedChannelError>> = {
  'ACQ.SYSTEM_ERROR': { code: PaymentErrorCode.PROVIDER_ERROR, retryable: true, mappedFrom: 'ACQ.SYSTEM_ERROR' },
  'ACQ.TRADE_NOT_EXIST': { code: PaymentErrorCode.PROVIDER_ERROR, retryable: false, mappedFrom: 'ACQ.TRADE_NOT_EXIST' },
  'ACQ.TRADE_STATUS_ERROR': { code: PaymentErrorCode.BUSINESS_ERROR, retryable: false, mappedFrom: 'ACQ.TRADE_STATUS_ERROR' },
};

/**
 * Map a raw Alipay error code to a PaymentError.
 * Unknown codes → PROVIDER_ERROR (retryable=false) with `mappedFrom` preserved.
 * Never throws the raw provider error.
 */
export function mapAlipayError(
  code: string,
  message?: string,
  cause?: unknown,
): PaymentError {
  const mapped = ALIPAY_ERROR_MAP[code] ?? {
    code: PaymentErrorCode.PROVIDER_ERROR,
    retryable: false,
    mappedFrom: code,
  };
  return new PaymentError(message ?? `Alipay error: ${code}`, {
    code: mapped.code,
    retryable: mapped.retryable,
    provider: 'alipay',
    mappedFrom: code,
    cause,
  });
}
