/**
 * Hunter Discovery abstraction.
 *
 * Business kernel must NOT know any concrete search vendor.
 * A provider only turns a query (or explicit seed URLs) into candidates.
 * No provider configured -> no candidates (fail-closed, never guessed).
 */

export interface DiscoveryQuery {
  /** Free-text query (e.g. "woocommerce outdoor gear"). */
  query?: string;
  /** Explicit seed URLs (manual/operator supplied). */
  urls?: string[];
  /** Max candidates to return. */
  limit?: number;
  /** Optional discovery filters (passed through to search providers). */
  country?: string;
  region?: string;
  industry?: string;
}

export interface DiscoveryCandidate {
  url: string;
  domain: string;
  /** Provider that produced this candidate, e.g. 'manual-seed' | 'search'. */
  source: string;
  observedAt: string;
  /** Optional short evidence snippet (never raw HTML). */
  evidence?: string;
}

export interface DiscoveryProvider {
  readonly name: string;
  discover(query: DiscoveryQuery): Promise<DiscoveryCandidate[]>;
}

/** Derives a stable domain key from a URL. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
