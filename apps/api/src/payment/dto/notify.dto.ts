/**
 * Expected shape of a payment-provider webhook payload.
 *
 * NOTE: The /payment/notify endpoint intentionally accepts a permissive
 * `any` body (provider payloads vary and carry extra fields). This DTO is a
 * documented contract only — verification is enforced via signature + order
 * ledger + idempotency in PaymentService, not via class-validator on the body
 * (the global ValidationPipe with `forbidNonWhitelisted` would otherwise
 * reject legitimate provider-specific fields).
 */
export interface NotifyDto {
  orderId: string;
  status: string;
  tenantId: string;
  plan: string;
  amount?: number;
  signature?: string;
}
