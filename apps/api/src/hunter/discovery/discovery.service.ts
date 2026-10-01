import { Injectable } from '@nestjs/common';
import {
  DiscoveryCandidate,
  DiscoveryProvider,
  DiscoveryQuery,
} from './discovery-provider.types';
import { UrlSafetyService } from './url-safety.service';

export interface VettedCandidate extends DiscoveryCandidate {
  ssrfBlocked: boolean;
  safetyReason?: string;
}

/**
 * Runs providers, then vets every candidate through URL safety.
 * Providers are pluggable; if none is configured the result is an empty list.
 */
@Injectable()
export class DiscoveryService {
  constructor(private readonly providers: DiscoveryProvider[], private readonly safety: UrlSafetyService) {}

  async discover(query: DiscoveryQuery): Promise<VettedCandidate[]> {
    const collected: DiscoveryCandidate[] = [];
    for (const provider of this.providers) {
      const found = await provider.discover(query);
      collected.push(...found);
    }

    // Domain dedupe within a single discovery call: keep the first candidate per
    // domain (operator manual seeds are earliest in the provider list, so they win
    // ties). Empty domains are never deduped. URL-level idempotency is still
    // enforced downstream in persistence — this only trims redundant candidates.
    const seenDomains = new Set<string>();
    const deduped: DiscoveryCandidate[] = [];
    for (const candidate of collected) {
      const domain = candidate.domain || '';
      if (domain && seenDomains.has(domain)) continue;
      if (domain) seenDomains.add(domain);
      deduped.push(candidate);
    }

    const vetted: VettedCandidate[] = [];
    for (const candidate of deduped) {
      const verdict = await this.safety.evaluate(candidate.url);
      vetted.push({
        ...candidate,
        ssrfBlocked: verdict.ssrfBlocked || !verdict.allowed,
        safetyReason: verdict.reason,
      });
    }
    return vetted;
  }
}
