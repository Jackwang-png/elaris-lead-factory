import { Injectable } from '@nestjs/common';

import { DiscoveryQuery } from './discovery/discovery-provider.types';
import { DiscoveryService, VettedCandidate } from './discovery/discovery.service';
import { PageFetchService } from './discovery/page-fetch.service';
import { HunterIntelligenceService } from './hunter-intelligence.service';
import { HunterPersistenceService } from './hunter-persistence.service';
import type { MerchantQualification } from '../elaris/qualification';
import type { WooCommerceDetection } from '../elaris/woocommerce-detector';
import type { HunterAssessment } from '../elaris/hunter.types';

const EMPTY_DETECTION: WooCommerceDetection = {
  isWooCommerce: false,
  confidence: 'NONE' as any,
  signals: [],
  strongSignals: [],
  weakSignals: [],
};

export interface HunterCandidateResult {
  url: string;
  domain: string;
  source: string;
  reachable: boolean;
  robotsAllowed: boolean;
  ssrfBlocked: boolean;
  timedOut: boolean;
  tooLarge: boolean;
  blockedReason?: string;
  detection: WooCommerceDetection;
  qualification: MerchantQualification;
  assessment: HunterAssessment | null;
  companyId?: string;
  signalId?: string;
  leadId?: string;
  runId?: string;
}

/**
 * HunterPipelineService — the SINGLE orchestration entry.
 *
 * Discovery -> Safety -> Fetch/Parse -> Detection -> qualifyMerchant
 *          -> buildHunterAssessment -> Persistence
 *
 * Controllers must never implement this logic.
 */
@Injectable()
export class HunterPipelineService {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly fetcher: PageFetchService,
    private readonly intelligence: HunterIntelligenceService,
    private readonly persistence: HunterPersistenceService,
  ) {}

  async run(tenantId: string, query: DiscoveryQuery): Promise<HunterCandidateResult[]> {
    const candidates = await this.discovery.discover(query);
    const results: HunterCandidateResult[] = [];
    for (const candidate of candidates) {
      results.push(await this.runOne(tenantId, candidate));
    }
    return results;
  }

  async runOne(tenantId: string, candidate: VettedCandidate): Promise<HunterCandidateResult> {
    let detection: WooCommerceDetection = EMPTY_DETECTION;
    let parsed: ReturnType<HunterIntelligenceService['parse']> | null = null;
    let reachable = false;
    let robotsAllowed = false;
    let timedOut = false;
    let tooLarge = false;
    let blockedReason = candidate.safetyReason;

    if (candidate.ssrfBlocked) {
      const qualification = this.intelligence.qualify({
        detection: EMPTY_DETECTION,
        signalCount: 0,
        reachable: false,
        robotsAllowed: false,
        ssrfBlocked: true,
      });
      return this.persist(tenantId, candidate, {
        reachable: false,
        robotsAllowed: false,
        ssrfBlocked: true,
        timedOut: false,
        tooLarge: false,
        blockedReason: blockedReason ?? 'Blocked by URL safety',
        detection: EMPTY_DETECTION,
        qualification,
      });
    }

    // robots pre-check (fail-closed on unreachable robots.txt)
    const robots = await this.fetcher.checkRobots(candidate.url);
    robotsAllowed = robots.robotsAllowed;
    if (!robotsAllowed) {
      blockedReason = robots.reason;
    }

    let finalUrl = candidate.url;
    if (robotsAllowed) {
      const page = await this.fetcher.fetchPage(candidate.url);
      finalUrl = page.finalUrl || candidate.url;
      reachable = page.ok && page.reachable;
      timedOut = page.timedOut;
      tooLarge = page.tooLarge;
      if (page.tooLarge) blockedReason = 'Response too large';
      if (page.timedOut) blockedReason = 'Fetch timeout';
      if (!reachable && !blockedReason) blockedReason = page.blockedReason;
      if (page.html) {
        parsed = this.intelligence.parse(page.html);
        detection = this.intelligence.detect(parsed);
      }
    }

    const signalCount = detection.strongSignals.length + detection.weakSignals.length;
    const qualification = this.intelligence.qualify({
      detection,
      signalCount,
      reachable,
      robotsAllowed,
      ssrfBlocked: false,
    });

    const assessment = this.intelligence.assess({
      url: finalUrl,
      parsed,
      observedAt: candidate.observedAt,
      qualification,
    });

    return this.persist(tenantId, { ...candidate, url: finalUrl }, {
      reachable,
      robotsAllowed,
      ssrfBlocked: false,
      timedOut,
      tooLarge,
      blockedReason,
      detection,
      qualification,
    }, assessment);
  }

  /**
   * Internal qualification for an EXISTING lead (used by /api/v2/hunter/qualified).
   *
   * Caller-supplied qualification is NEVER consulted here. If the platform has no
   * internally computed evidence for the lead, the answer is REJECTED (fail-closed).
   */
  async internalQualificationForLead(
    tenantId: string,
    leadId: string,
  ): Promise<{ qualification: MerchantQualification; source: 'internal' | 'fail-closed' }> {
    const latest = await (this.persistence as any).prisma.leadIntelligence.findFirst({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
    });

    const stored = latest?.modelMetadata?.qualification;
    if (stored && typeof stored.grade === 'string') {
      return { qualification: stored as MerchantQualification, source: 'internal' };
    }

    return {
      qualification: this.intelligence.qualify({
        detection: EMPTY_DETECTION,
        signalCount: 0,
        reachable: false,
        robotsAllowed: false,
        ssrfBlocked: false,
      }),
      source: 'fail-closed',
    };
  }

  private async persist(
    tenantId: string,
    candidate: VettedCandidate,
    outcome: Omit<HunterCandidateResult, 'url' | 'domain' | 'source' | 'assessment'> & {
      qualification: MerchantQualification;
    },
    assessment: HunterAssessment | null = null,
  ): Promise<HunterCandidateResult> {
    const qualification = outcome.qualification;
    const occurredAt = new Date();

    const company = await this.persistence.upsertCompany(tenantId, {
      domain: candidate.domain || candidate.url,
      name: candidate.domain || candidate.url,
      website: candidate.url,
    });

    const signal = await this.persistence.recordSignal(tenantId, {
      companyId: company.id,
      url: candidate.url,
      signalType: qualification.isEcommerce ? 'woocommerce_detected' : 'merchant_candidate',
      evidence: [
        `source=${candidate.source}`,
        `grade=${qualification.grade}`,
        ...qualification.observedSignals,
      ].join('; '),
      sourceSystem: 'hunter',
      occurredAt,
      rawData: { detection: outcome.detection, blockedReason: outcome.blockedReason ?? null },
    });

    const lead = await this.persistence.upsertLead(tenantId, {
      companyId: company.id,
      signalId: signal.id,
      name: company.name,
      icpScore: qualification.score,
      recommendedAction: qualification.recommendedAction,
      qualifiedBy: 'elaris-v1.4',
    });

    const run = await this.persistence.ensureRun(tenantId, lead.id, {
      triggerType: 'hunter_discover',
      idempotencyKey: HunterPersistenceService.idempotencyKey(tenantId, candidate.url),
      inputHash: HunterPersistenceService.inputHash(candidate.url),
    });

    await this.persistence.saveIntelligence(tenantId, lead.id, run.id, {
      leadScore: qualification.score,
      fitScore: qualification.score,
      intentScore: null,
      priority: priorityForGrade(qualification.grade),
      observed: { detection: outcome.detection, qualification },
      inferred: { assessment: assessment ?? null },
      unknowns: [],
      signals: qualification.observedSignals,
      painPoints: [],
      recommendedAction: qualification.recommendedAction,
      suggestedStrategy: {},
      reasoningSummary: qualification.reasons.join('; '),
      modelMetadata: {
        provider: 'elaris-v1.4',
        model: 'deterministic',
        qualification,
        assessment: assessment ?? null,
      },
    });

    await this.persistence.saveSignals(tenantId, lead.id, run.id, [
      ...qualification.observedSignals.map((s) => ({
        signalType: 'commerce_signal',
        factOrInference: 'FACT' as const,
        confidence: 'MEDIUM',
        evidenceText: s,
        sourceRef: candidate.url,
      })),
      {
        signalType: 'qualification',
        factOrInference: 'INFERRED' as const,
        confidence: 'MEDIUM',
        evidenceText: `grade=${qualification.grade}`,
        sourceRef: candidate.url,
      },
    ]);

    return {
      url: candidate.url,
      domain: candidate.domain,
      source: candidate.source,
      reachable: outcome.reachable,
      robotsAllowed: outcome.robotsAllowed,
      ssrfBlocked: outcome.ssrfBlocked,
      timedOut: outcome.timedOut,
      tooLarge: outcome.tooLarge,
      blockedReason: outcome.blockedReason,
      detection: outcome.detection,
      qualification,
      assessment,
      companyId: company.id,
      signalId: signal.id,
      leadId: lead.id,
      runId: run.id,
    };
  }
}

export function priorityForGrade(grade: string): string {
  switch (grade) {
    case 'A_STRONG':
      return 'P0';
    case 'B_POTENTIAL':
      return 'P1';
    case 'C_WEAK':
      return 'P2';
    default:
      return 'P3';
  }
}
