import { Injectable } from '@nestjs/common';
import {
  DiscoveryCandidate,
  DiscoveryProvider,
  DiscoveryQuery,
  domainOf,
} from './discovery-provider.types';
import { SearchProviderConfig } from './search-provider.config';

/**
 * Thrown when the search provider cannot fulfil the request for a real,
 * externally-caused reason: misconfiguration (no API key) or upstream failure.
 * Carries NO results — callers must treat this as "discovery failed", never as
 * "search returned nothing".
 */
export class SearchProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchProviderUnavailableError';
  }
}

export interface SearchFetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export type SearchFetchImpl = (
  input: string,
  init: SearchFetchInit,
) => Promise<Response>;

const MAX_SEARCH_RESULTS = 10;

function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * SearchProvider — adapter for a single external JSON search API.
 *
 * Implements DiscoveryProvider so the business kernel stays vendor-agnostic:
 * HunterPipelineService / HunterModule only ever see `DiscoveryCandidate[]`.
 *
 * FAIL-CLOSED guarantees:
 *  - no API key               => throws SearchProviderUnavailableError
 *  - upstream error / !ok     => throws SearchProviderUnavailableError
 *  - unreadable / bad JSON    => throws SearchProviderUnavailableError
 *  - never fabricates URLs    => only links returned by the API become candidates
 *  - never stores raw HTML    => evidence is a short title/snippet fragment only
 *  - never logs the API key
 */
@Injectable()
export class SearchProvider implements DiscoveryProvider {
  readonly name: string;

  constructor(
    private readonly config: SearchProviderConfig,
    private readonly fetchImpl?: SearchFetchImpl,
  ) {
    this.name = config.name;
  }

  async discover(query: DiscoveryQuery): Promise<DiscoveryCandidate[]> {
    if (!this.config.apiKey) {
      throw new SearchProviderUnavailableError(
        'Search provider not configured (SEARCH_PROVIDER_API_KEY missing)',
      );
    }

    const q = buildQueryString(query);
    if (!q) return [];

    let res: Response;
    try {
      const signal = AbortSignal.timeout(this.config.timeoutMs);
      const impl: SearchFetchImpl =
        this.fetchImpl ??
        ((input: string, init: SearchFetchInit) => fetch(input, init) as Promise<Response>);
      res = await impl(this.config.endpoint, {
        method: 'POST',
        headers: {
          'X-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q }),
        signal,
      });
    } catch {
      throw new SearchProviderUnavailableError('Search provider request failed');
    }

    if (!res.ok) {
      throw new SearchProviderUnavailableError(
        `Search provider returned HTTP ${res.status}`,
      );
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new SearchProviderUnavailableError('Search provider response unreadable');
    }

    const raw = Array.isArray(json?.organicResults)
      ? json.organicResults
      : Array.isArray(json?.organic)
        ? json.organic
        : [];

    const now = new Date().toISOString();
    const limit = Math.min(query.limit ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);

    const candidates: DiscoveryCandidate[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const link = typeof item.link === 'string' ? item.link : item.url;
      if (typeof link !== 'string' || link.trim() === '') continue;

      const url = normalizeUrl(link.trim());
      const domain = domainOf(url);
      if (!domain) continue;

      const title = stripHtml(typeof item.title === 'string' ? item.title : '');
      const snippet = stripHtml(typeof item.snippet === 'string' ? item.snippet : '');
      const evidence = truncate([title, snippet].filter(Boolean).join(' — '));

      candidates.push({
        url,
        domain,
        source: this.name,
        observedAt: now,
        evidence,
      });

      if (candidates.length >= limit) break;
    }
    return candidates;
  }
}

/**
 * Compose the search query string from the discovery query.
 * Order is intentionally loose; the search backend tokenizes the whole phrase.
 */
function buildQueryString(query: DiscoveryQuery): string {
  const parts: string[] = [];
  if (query.query && query.query.trim()) parts.push(query.query.trim());
  if (query.industry && query.industry.trim()) parts.push(query.industry.trim());
  if (query.region && query.region.trim()) parts.push(query.region.trim());
  if (query.country && query.country.trim()) parts.push(query.country.trim());
  return parts.join(' ');
}
