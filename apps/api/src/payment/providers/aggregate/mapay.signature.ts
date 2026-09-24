/**
 * MaPay (码支付) MD5 signature — implements the official sign rule:
 *
 *   1. Sort all params by ASCII key ascending (a-z).
 *   2. Exclude `sign`, `sign_type` and empty values.
 *   3. Join as URL key-value pairs: a=b&c=d&e=f (values NOT url-encoded).
 *   4. sign = md5(joinedString + KEY), lowercase.
 *
 * Same rule applies to request signing and webhook verification.
 */
import { createHash, timingSafeEqual } from 'crypto';

/** Excluded from signing per the official algorithm. */
const EXCLUDED_KEYS = new Set(['sign', 'sign_type']);

export function buildSignString(
  params: Record<string, unknown>,
  key: string,
): string {
  const parts: string[] = Object.keys(params)
    .filter((k) => !EXCLUDED_KEYS.has(k))
    .filter((k) => {
      const v = params[k];
      return v !== '' && v !== null && v !== undefined;
    })
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${String(params[k])}`);
  return parts.join('&') + key;
}

/** Compute the MD5 sign for the given params + merchant key. */
export function signParams(
  params: Record<string, unknown>,
  key: string,
): string {
  return createHash('md5').update(buildSignString(params, key), 'utf8').digest('hex');
}

/** Verify an incoming sign (webhook / return) in a timing-safe way. */
export function verifySign(
  params: Record<string, unknown>,
  key: string,
  providedSign: string | undefined,
): boolean {
  if (!providedSign) return false;
  const expected = signParams(params, key);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(providedSign.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
