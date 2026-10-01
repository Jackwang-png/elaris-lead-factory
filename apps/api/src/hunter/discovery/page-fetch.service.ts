import { Injectable } from '@nestjs/common';
import { UrlSafetyService } from './url-safety.service';

/**
 * Hunter page fetch — single-page fetch used ONLY for immediate parsing.
 *
 * Guarantees:
 *  - manual redirect following, every hop re-checked by UrlSafetyService
 *  - hard timeout
 *  - hard response size limit (streamed, aborted when exceeded)
 *  - raw HTML is returned for parsing and NEVER persisted
 */

export interface FetchResult {
  ok: boolean;
  reachable: boolean;
  finalUrl: string;
  status?: number;
  html?: string;
  bytes: number;
  timedOut: boolean;
  tooLarge: boolean;
  hops: string[];
  blockedReason?: string;
}

export interface RobotsResult {
  robotsAllowed: boolean;
  reason?: string;
}

export const DEFAULT_MAX_REDIRECTS = 3;
export const DEFAULT_FETCH_TIMEOUT_MS = 5_000;
export const DEFAULT_MAX_BYTES = 512 * 1024;

export type FetchImpl = (url: string, init: { signal: AbortSignal; redirect: 'manual' }) => Promise<Response>;

@Injectable()
export class PageFetchService {
  constructor(
    private readonly safety: UrlSafetyService,
    /** Injectable for tests; defaults to global fetch. */
    private readonly fetchImpl?: FetchImpl,
  ) {}

  private async doFetch(url: string, timeoutMs: number): Promise<Response> {
    const signal = AbortSignal.timeout(timeoutMs);
    const impl = this.fetchImpl ?? ((u: string, init: any) => fetch(u, init) as Promise<Response>);
    return impl(url, { signal, redirect: 'manual' });
  }

  /** robots.txt pre-check. No robots file (404/410) => allowed; errors => fail-closed. */
  async checkRobots(url: string, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<RobotsResult> {
    let robotsUrl: string;
    try {
      const p = new URL(url);
      robotsUrl = `${p.protocol}//${p.host}/robots.txt`;
    } catch {
      return { robotsAllowed: false, reason: 'Invalid URL for robots check' };
    }

    let res: Response;
    try {
      res = await this.doFetch(robotsUrl, timeoutMs);
    } catch {
      return { robotsAllowed: false, reason: 'robots.txt unreachable (fail-closed)' };
    }

    if (res.status === 404 || res.status === 410) {
      return { robotsAllowed: true };
    }
    if (!res.ok) {
      return { robotsAllowed: false, reason: `robots.txt status ${res.status} (fail-closed)` };
    }

    let body: string;
    try {
      body = await res.text();
    } catch {
      return { robotsAllowed: false, reason: 'robots.txt unreadable (fail-closed)' };
    }

    return parseRobots(body);
  }

  async fetchPage(
    url: string,
    opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
  ): Promise<FetchResult> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

    const hops: string[] = [];
    let current = url;

    for (let hop = 0; hop <= maxRedirects; hop += 1) {
      // Redirect re-check: every hop must pass safety again.
      const verdict = await this.safety.evaluate(current);
      if (!verdict.allowed) {
        return {
          ok: false,
          reachable: false,
          finalUrl: current,
          bytes: 0,
          timedOut: false,
          tooLarge: false,
          hops,
          blockedReason: verdict.reason ?? 'Blocked by URL safety',
        };
      }
      hops.push(current);

      let res: Response;
      try {
        res = await this.doFetch(current, timeoutMs);
      } catch (err: any) {
        const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        return {
          ok: false,
          reachable: false,
          finalUrl: current,
          bytes: 0,
          timedOut,
          tooLarge: false,
          hops,
          blockedReason: timedOut ? 'Fetch timeout' : 'Fetch failed',
        };
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          return {
            ok: false,
            reachable: false,
            finalUrl: current,
            status: res.status,
            bytes: 0,
            timedOut: false,
            tooLarge: false,
            hops,
            blockedReason: 'Redirect without location',
          };
        }
        try {
          current = new URL(location, current).toString();
        } catch {
          return {
            ok: false,
            reachable: false,
            finalUrl: current,
            status: res.status,
            bytes: 0,
            timedOut: false,
            tooLarge: false,
            hops,
            blockedReason: 'Invalid redirect target',
          };
        }
        continue; // next hop re-checks safety
      }

      if (!res.ok) {
        return {
          ok: false,
          reachable: false,
          finalUrl: current,
          status: res.status,
          bytes: 0,
          timedOut: false,
          tooLarge: false,
          hops,
          blockedReason: `HTTP ${res.status}`,
        };
      }

      // Streamed read with hard size cap.
      try {
        const reader = res.body?.getReader();
        if (!reader) {
          const text = await res.text();
          if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            return {
              ok: false,
              reachable: true,
              finalUrl: current,
              status: res.status,
              bytes: Buffer.byteLength(text, 'utf8'),
              timedOut: false,
              tooLarge: true,
              hops,
              blockedReason: 'Response too large',
            };
          }
          return {
            ok: true,
            reachable: true,
            finalUrl: current,
            status: res.status,
            html: text,
            bytes: Buffer.byteLength(text, 'utf8'),
            timedOut: false,
            tooLarge: false,
            hops,
          };
        }

        const chunks: Uint8Array[] = [];
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            await reader.cancel().catch(() => undefined);
            return {
              ok: false,
              reachable: true,
              finalUrl: current,
              status: res.status,
              bytes: total,
              timedOut: false,
              tooLarge: true,
              hops,
              blockedReason: 'Response too large',
            };
          }
          chunks.push(value);
        }
        const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
        return {
          ok: true,
          reachable: true,
          finalUrl: current,
          status: res.status,
          html,
          bytes: total,
          timedOut: false,
          tooLarge: false,
          hops,
        };
      } catch (err: any) {
        const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        return {
          ok: false,
          reachable: false,
          finalUrl: current,
          bytes: 0,
          timedOut,
          tooLarge: false,
          hops,
          blockedReason: timedOut ? 'Read timeout' : 'Read failed',
        };
      }
    }

    return {
      ok: false,
      reachable: false,
      finalUrl: current,
      bytes: 0,
      timedOut: false,
      tooLarge: false,
      hops,
      blockedReason: 'Too many redirects',
    };
  }
}

/** Minimal robots.txt evaluation for user-agent '*'. */
export function parseRobots(body: string): RobotsResult {
  const lines = body.split(/\r?\n/);
  let applies = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = (rawKey || '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      applies = value === '*';
      continue;
    }
    if (applies && key === 'disallow') {
      if (value === '/' || value === '') {
        return { robotsAllowed: false, reason: 'robots.txt disallows all (Disallow: /)' };
      }
    }
  }
  return { robotsAllowed: true };
}
