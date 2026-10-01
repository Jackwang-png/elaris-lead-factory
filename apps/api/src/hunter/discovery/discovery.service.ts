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
      // A provider that throws (e.g. misconfigured search) fails the whole
      // discovery closed-loop — we never silently substitute empty results.
      const found = await provider.discover(query);
      collected.push(...found);
    }

    const deduped = dedupeCandidates(collected);

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

/**
 * Merge duplicate candidates by domain (case-insensitive).
 *
 * - different domains are never merged.
 * - the first occurrence is kept as the canonical record.
 * - if a later same-domain candidate carries a MORE complete evidence string,
 *   its evidence replaces the canonical one (traceability preserved).
 * No caching / external state is introduced.
 */
export function dedupeCandidates(
  candidates: DiscoveryCandidate[],
): DiscoveryCandidate[] {
  const byKey = new Map<string, DiscoveryCandidate>();
  for (const candidate of candidates) {
    const key = (candidate.domain || candidate.url).toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    const existingLen = (existing.evidence ?? '').length;
    const incomingLen = (candidate.evidence ?? '').length;
    if (incomingLen > existingLen) {
      byKey.set(key, { ...existing, evidence: candidate.evidence });
    }
  }
  return [...byKey.values()];
}
