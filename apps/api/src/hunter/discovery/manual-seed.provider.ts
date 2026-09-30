import { Injectable } from '@nestjs/common';
import {
  DiscoveryCandidate,
  DiscoveryProvider,
  DiscoveryQuery,
  domainOf,
} from './discovery-provider.types';

/**
 * ManualSeedProvider — the only provider enabled in v1.
 *
 * Turns explicit seed URLs into candidates. It performs no network access and
 * invents nothing: no seeds => no candidates.
 */
@Injectable()
export class ManualSeedProvider implements DiscoveryProvider {
  readonly name = 'manual-seed';

  async discover(query: DiscoveryQuery): Promise<DiscoveryCandidate[]> {
    const urls = (query.urls ?? []).filter((u) => typeof u === 'string' && u.trim().length > 0);
    const limit = query.limit ?? 25;
    const now = new Date().toISOString();

    return urls.slice(0, limit).map((raw) => {
      const url = normalizeUrl(raw.trim());
      return {
        url,
        domain: domainOf(url),
        source: this.name,
        observedAt: now,
        evidence: query.query ? `seed for query: ${query.query}` : 'operator seed',
      };
    });
  }
}

export function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}
