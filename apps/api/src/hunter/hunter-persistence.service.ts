import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Persistence mapping for the Hunter closed loop.
 *
 * Reuses EXISTING structures only (no new models, no migration):
 *   Company -> IntelligenceSignal -> Lead -> LeadAnalysisRun -> LeadIntelligence -> LeadSignal
 *
 * Idempotency:
 *   Company            : findFirst by (tenantId, domain)
 *   IntelligenceSignal : findFirst by unique (tenantId, sourceSystem, evidenceHash)
 *   Lead               : findFirst by (tenantId, companyId, source)
 *   LeadAnalysisRun    : findFirst by unique (tenantId, idempotencyKey)
 */
@Injectable()
export class HunterPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  static evidenceHash(parts: string[]): string {
    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  static inputHash(url: string): string {
    return createHash('sha256').update(`hunter:v1:${url}`).digest('hex');
  }

  static idempotencyKey(tenantId: string, url: string): string {
    return `hunter-discover:${tenantId}:${HunterPersistenceService.inputHash(url)}`;
  }

  async upsertCompany(
    tenantId: string,
    input: { domain: string; name?: string | null; website?: string },
  ): Promise<any> {
    const existing = await this.prisma.company.findFirst({
      where: { tenantId, domain: input.domain },
    });
    if (existing) return existing;

    const name = input.name || input.domain;
    return this.prisma.company.create({
      data: {
        tenantId,
        name,
        normalizedName: name.toLowerCase(),
        domain: input.domain,
        website: input.website ?? input.domain,
        source: 'hunter',
      },
    });
  }

  async recordSignal(
    tenantId: string,
    input: {
      companyId?: string | null;
      url: string;
      signalType: string;
      evidence: string;
      sourceSystem: string;
      occurredAt: Date;
      rawData?: unknown;
    },
  ): Promise<any> {
    const evidenceHash = HunterPersistenceService.evidenceHash([
      input.sourceSystem,
      input.url,
      input.evidence,
    ]);

    const existing = await this.prisma.intelligenceSignal.findFirst({
      where: { tenantId, sourceSystem: input.sourceSystem, evidenceHash },
    });
    if (existing) return existing;

    return this.prisma.intelligenceSignal.create({
      data: {
        tenantId,
        companyId: input.companyId ?? null,
        sourceSystem: input.sourceSystem,
        sourceType: 'hunter_discovery',
        signalType: input.signalType,
        evidence: input.evidence,
        sourceUrl: input.url,
        evidenceHash,
        rawData: (input.rawData ?? {}) as any,
        occurredAt: input.occurredAt,
        detectedAt: new Date(),
      },
    });
  }

  async upsertLead(
    tenantId: string,
    input: {
      companyId?: string | null;
      signalId?: string | null;
      name: string;
      industry?: string | null;
      icpScore?: number | null;
      recommendedAction?: string | null;
      qualifiedBy?: string | null;
    },
  ): Promise<any> {
    const where: any = { tenantId, source: 'hunter' };
    if (input.companyId) where.companyId = input.companyId;

    const existing = await this.prisma.lead.findFirst({ where });
    if (existing) {
      return this.prisma.lead.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          industry: input.industry ?? undefined,
          icpScore: input.icpScore ?? undefined,
          recommendedAction: input.recommendedAction ?? undefined,
          qualifiedBy: input.qualifiedBy ?? undefined,
          qualifiedAt: new Date(),
        },
      });
    }

    return this.prisma.lead.create({
      data: {
        tenantId,
        name: input.name,
        company: input.name,
        industry: input.industry ?? undefined,
        source: 'hunter',
        companyId: input.companyId ?? null,
        signalId: input.signalId ?? null,
        icpScore: input.icpScore ?? undefined,
        recommendedAction: input.recommendedAction ?? undefined,
        qualifiedBy: input.qualifiedBy ?? undefined,
        qualifiedAt: new Date(),
      },
    });
  }

  async ensureRun(
    tenantId: string,
    leadId: string,
    input: { triggerType: string; idempotencyKey: string; inputHash: string },
  ): Promise<any> {
    const existing = await this.prisma.leadAnalysisRun.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    return this.prisma.leadAnalysisRun.create({
      data: {
        tenantId,
        leadId,
        triggerType: input.triggerType,
        contextVersion: 'hunter-v1',
        promptVersion: 'deterministic-v1.4',
        idempotencyKey: input.idempotencyKey,
        inputHash: input.inputHash,
        provider: 'elaris-v1.4',
        model: 'deterministic',
        status: 'SUCCESS',
        completedAt: new Date(),
      },
    });
  }

  async saveIntelligence(
    tenantId: string,
    leadId: string,
    runId: string,
    payload: {
      leadScore?: number | null;
      fitScore?: number | null;
      intentScore?: number | null;
      priority?: string | null;
      observed?: unknown;
      inferred?: unknown;
      unknowns?: unknown;
      signals?: unknown;
      painPoints?: unknown;
      recommendedAction?: string | null;
      suggestedStrategy?: unknown;
      reasoningSummary?: string | null;
      modelMetadata?: unknown;
    },
  ): Promise<any> {
    const data: any = {
      leadScore: payload.leadScore ?? null,
      fitScore: payload.fitScore ?? null,
      intentScore: payload.intentScore ?? null,
      priority: payload.priority ?? null,
      observed: (payload.observed ?? {}) as any,
      inferred: (payload.inferred ?? {}) as any,
      unknowns: (payload.unknowns ?? {}) as any,
      signals: (payload.signals ?? []) as any,
      painPoints: (payload.painPoints ?? []) as any,
      recommendedAction: payload.recommendedAction ?? null,
      suggestedStrategy: (payload.suggestedStrategy ?? {}) as any,
      reasoningSummary: payload.reasoningSummary ?? null,
      modelMetadata: (payload.modelMetadata ?? {}) as any,
    };

    const existing = await this.prisma.leadIntelligence.findFirst({ where: { runId } });
    if (existing) {
      return this.prisma.leadIntelligence.update({ where: { id: existing.id }, data });
    }
    return this.prisma.leadIntelligence.create({
      data: { tenantId, leadId, runId, ...data },
    });
  }

  async saveSignals(
    tenantId: string,
    leadId: string,
    runId: string,
    signals: Array<{
      signalType: string;
      factOrInference: 'FACT' | 'INFERRED';
      confidence?: string;
      evidenceText?: string;
      sourceRef?: string;
    }>,
  ): Promise<void> {
    for (const s of signals) {
      await this.prisma.leadSignal.create({
        data: {
          tenantId,
          leadId,
          runId,
          signalType: s.signalType,
          factOrInference: s.factOrInference,
          confidence: s.confidence ?? null,
          evidenceText: s.evidenceText ?? null,
          sourceRef: s.sourceRef ?? null,
          observedAt: new Date(),
        },
      });
    }
  }
}
