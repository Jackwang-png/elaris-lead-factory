import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify a webhook signature using HMAC-SHA256 with timing-safe comparison.
 *
 * Used to authenticate payment provider callbacks (/payment/notify) so that
 * forged payloads cannot activate subscriptions. The secret MUST be injected
 * via the PAYMENT_WEBHOOK_SECRET environment variable — never hardcode it.
 *
 * P0 scope: framework only. Real provider SDK signature schemes (WeChat Pay V3
 * RSA, Alipay RSA2, Stripe tolerance) will be wired in P2.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' = 'sha256',
): boolean {
  if (!signature || !secret) return false;
  const digest = createHmac(algorithm, secret).update(payload).digest('hex');
  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
