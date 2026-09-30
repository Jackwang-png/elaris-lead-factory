import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Hunter URL safety — SSRF / private-network / redirect-rebind guard.
 *
 * Design rules:
 *  - only http / https are ever allowed
 *  - every hop is re-evaluated (redirect re-check)
 *  - resolution is checked for ALL returned addresses (rebind surface)
 *  - fail-closed: unknown / unresolvable / private => blocked
 *
 * This service performs NO crawling and stores NO raw HTML.
 */

export interface UrlSafetyVerdict {
  url: string;
  allowed: boolean;
  ssrfBlocked: boolean;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254',
]);

export function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return true;
  if (p[0] === 10) return true;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  if (p[0] === 192 && p[1] === 168) return true;
  if (p[0] === 127) return true;
  if (p[0] === 169 && p[1] === 254) return true;
  if (p[0] === 0) return true;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
  return false;
}

export function ipv6IsPrivate(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::' || s === '::1') return true;
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // ULA
  if (s.startsWith('fe80')) return true; // link-local
  if (s.startsWith('::ffff:')) {
    const mapped = s.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return ipv4IsPrivate(mapped);
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return ipv4IsPrivate(ip);
  if (fam === 6) return ipv6IsPrivate(ip);
  return true; // unparseable => fail-closed
}

@Injectable()
export class UrlSafetyService {
  /**
   * @param resolveImpl injectable resolver (tests inject a deterministic one,
   *                    production uses dns.lookup).
   */
  constructor(private readonly resolveImpl?: (host: string) => Promise<string[]>) {}

  private async resolve(host: string): Promise<string[]> {
    if (this.resolveImpl) return this.resolveImpl(host);
    const addrs = await lookup(host, { all: true });
    return addrs.map((a) => a.address);
  }

  /** Protocol + SSRF evaluation for one hop. */
  async evaluate(url: string): Promise<UrlSafetyVerdict> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { url, allowed: false, ssrfBlocked: true, reason: 'Invalid URL' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { url, allowed: false, ssrfBlocked: true, reason: `Protocol not allowed: ${parsed.protocol}` };
    }

    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(host)) {
      return { url, allowed: false, ssrfBlocked: true, reason: 'Blocked internal hostname' };
    }

    // Literal IP in URL -> check directly.
    if (isIP(host) !== 0) {
      if (isPrivateAddress(host)) {
        return { url, allowed: false, ssrfBlocked: true, reason: 'Private/loopback/link-local address' };
      }
      return { url, allowed: true, ssrfBlocked: false };
    }

    let addresses: string[];
    try {
      addresses = await this.resolve(host);
    } catch {
      return { url, allowed: false, ssrfBlocked: true, reason: 'Host does not resolve' };
    }

    if (addresses.length === 0) {
      return { url, allowed: false, ssrfBlocked: true, reason: 'Host resolves to no address' };
    }

    // Rebind surface: ALL resolved addresses must be public.
    for (const addr of addresses) {
      if (isPrivateAddress(addr)) {
        return {
          url,
          allowed: false,
          ssrfBlocked: true,
          reason: `Resolves to private address: ${addr}`,
        };
      }
    }

    return { url, allowed: true, ssrfBlocked: false };
  }
}
