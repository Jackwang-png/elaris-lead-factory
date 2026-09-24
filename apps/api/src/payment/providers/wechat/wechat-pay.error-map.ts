/**
 * T2.5 — WeChat Pay channel error code → PaymentErrorCode mapping
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

/** WeChat Pay V3 known error codes (design-freeze base mapping). */
export const WECHAT_PAY_ERROR_MAP: Readonly<Record<string, MappedChannelError>> = {
  SYSTEMERROR: { code: PaymentErrorCode.PROVIDER_ERROR, retryable: true, mappedFrom: 'SYSTEMERROR' },
  ORDERNOTEXIST: { code: PaymentErrorCode.PROVIDER_ERROR, retryable: false, mappedFrom: 'ORDERNOTEXIST' },
  USERPAYING: { code: PaymentErrorCode.RETRYABLE_ERROR, retryable: true, mappedFrom: 'USERPAYING' },
  TRADE_STATE_ERROR: { code: PaymentErrorCode.BUSINESS_ERROR, retryable: false, mappedFrom: 'TRADE_STATE_ERROR' },
};

/**
 * Map a raw WeChat Pay error code to a PaymentError.
 * Unknown codes → PROVIDER_ERROR (retryable=false) with `mappedFrom` preserved.
 * Never throws the raw provider error.
 */
export function mapWechatError(
  code: string,
  message?: string,
  cause?: unknown,
): PaymentError {
  const mapped = WECHAT_PAY_ERROR_MAP[code] ?? {
    code: PaymentErrorCode.PROVIDER_ERROR,
    retryable: false,
    mappedFrom: code,
  };
  return new PaymentError(message ?? `WeChat Pay error: ${code}`, {
    code: mapped.code,
    retryable: mapped.retryable,
    provider: 'wechat',
    mappedFrom: code,
    cause,
  });
}
