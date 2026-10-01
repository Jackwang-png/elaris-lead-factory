import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DiscoveryCandidate,
  DiscoveryProvider,
  DiscoveryQuery,
  domainOf,
} from './discovery-provider.types';

/**
 * You.com Web Search provider for Hunter discovery.
 *
 * Implements the vendor-agnostic DiscoveryProvider contract: it turns a free-text
 * query into candidate merchant URLs. It performs NO crawling and never touches
 * the URLs it returns — URL safety and page fetching stay downstream in the
 * pipeline (UrlSafetyService / PageFetchService).
 *
 * Fail-closed rules (never guess):
 *  - no query            -> []
 *  - missing YDC_API_KEY -> []
 *  - network / timeout   -> []
 *  - non-2xx            -> []
 *  - malformed JSON     -> []
 *  - malformed structure-> []
 * The API key is only sent as the X-API-Key header and is NEVER written to logs.
 */

const YOU_COM_ENDPOINT = 'https://ydc-index.io/v1/search';
const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;
const REQUEST_TIMEOUT_MS = 8_000;

export type YouComFetchImpl = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<Response>;

interface YouComWebHit {
  url?: unknown;
  title?: unknown;
  description?: unknown;
  snippets?: unknown;
}

@Injectable()
export class YouComSearchProvider implements DiscoveryProvider {
  readonly name = 'you-com';

  constructor(
    private readonly config: ConfigService,
    /** Injectable for tests; defaults to the global fetch. */
    private readonly fetchImpl?: YouComFetchImpl,
  ) {}

  async discover(query: DiscoveryQuery): Promise<DiscoveryCandidate[]> {
    const q = (query.query ?? '').toString().trim();
    if (!q) return []; // no query => nothing to search

    const apiKey = this.config.get<string>('YDC_API_KEY');
    if (!apiKey) return []; // missing key => fail-closed

    const count = normalizeCount(query.limit);
    const observedAt = new Date().toISOString();

    let res: Response;
    try {
      res = await this.callApi(q, count, apiKey);
    } catch {
      return []; // timeout / network error => fail-closed
    }

    if (!res.ok) return []; // non-2xx => fail-closed

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return []; // malformed JSON => fail-closed
    }

    return normalizeResults(payload, observedAt, this.name);
  }

  private callApi(q: string, count: number, apiKey: string): Promise<Response> {
    const impl =
      this.fetchImpl ?? ((u: string, init: any) => fetch(u, init) as Promise<Response>);
    return impl(YOU_COM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ query: q, count }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}

function normalizeCount(limit?: number): number {
  const n =
    typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : DEFAULT_COUNT;
  if (n < 1) return 1;
  if (n > MAX_COUNT) return MAX_COUNT;
  return n;
}

function normalizeResults(payload: unknown, observedAt: string, source: string): DiscoveryCandidate[] {
  // Official You.com Web Search response shape: { results: { web: [...] } }.
  // Missing `results` or a non-array `results.web` => fail-closed to [].
  const results = (payload as { results?: unknown })?.results;
  const web = (results as { web?: unknown })?.web;
  if (!Array.isArray(web)) return []; // malformed structure => fail-closed

  const out: DiscoveryCandidate[] = [];
  for (const hit of web) {
    const raw = (hit as YouComWebHit)?.url;
    if (typeof raw !== 'string') continue;

    let url: string;
    try {
      url = new URL(raw).toString();
    } catch {
      continue; // unusable URL
    }
    if (!/^https?:\/\//i.test(url)) continue;

    out.push({
      url,
      domain: domainOf(url),
      source,
      observedAt,
      evidence: buildEvidence(hit as YouComWebHit),
    });
  }
  return out;
}

/**
 * Evidence uses ONLY public result fields (title / description / snippets).
 * It is a short, human-readable string — never raw HTML.
 */
function buildEvidence(hit: YouComWebHit): string {
  const parts: string[] = [];
  if (typeof hit.title === 'string' && hit.title.trim()) {
    parts.push(`title: ${hit.title.trim()}`);
  }
  if (typeof hit.description === 'string' && hit.description.trim()) {
    parts.push(`description: ${hit.description.trim()}`);
  }
  if (Array.isArray(hit.snippets)) {
    for (const s of hit.snippets) {
      if (typeof s === 'string' && s.trim()) parts.push(s.trim());
    }
  }
  return parts.join(' | ');
}
