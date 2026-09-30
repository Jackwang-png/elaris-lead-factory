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

    const vetted: VettedCandidate[] = [];
    for (const candidate of collected) {
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
