/**
 * T2.3 — Payment enums (Design Freeze v1).
 *
 * FROZEN PaymentFeature — do NOT add/remove values here.
 * Provider supports() MUST only use this enum.
 */

/** Frozen payment capabilities. */
export enum PaymentFeature {
  PARTIAL_REFUND = 'PARTIAL_REFUND',
  QUERY_ORDER = 'QUERY_ORDER',
  QUERY_REFUND = 'QUERY_REFUND',
  CLOSE_ORDER = 'CLOSE_ORDER',
  WEBHOOK_VERIFY = 'WEBHOOK_VERIFY',
  BALANCE_QUERY = 'BALANCE_QUERY',
  APP_PAY = 'APP_PAY',
  JSAPI = 'JSAPI',
  NATIVE = 'NATIVE',
  H5 = 'H5',
  AUTO_CAPTURE = 'AUTO_CAPTURE',
  REFUND = 'REFUND',
}

/** Provider health status. */
export enum HealthStatus {
  UP = 'UP',
  DOWN = 'DOWN',
  UNKNOWN = 'UNKNOWN',
}
