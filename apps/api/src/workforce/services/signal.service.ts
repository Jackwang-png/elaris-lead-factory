import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { CompanyService } from './company.service';
import { ComplianceService } from './compliance.service';
import { WorkforceContext } from '../workforce.types';

export interface SignalInput {
  sourceType?: string; // daily_batch | manual_submit | event_trigger
  sourceSystem?: string; // 默认 scout
  signalType: string;
  signalStrength?: string;
  relevanceScore?: number; // 0-100
  credibility?: string; // verified | pending | rejected
  evidence?: string;
  sourceUrl?: string;
  description?: string;
  rawData?: any;
  evidenceHash?: string;
  recommendedAction?: string;
  occurredAt?: string;
  company?: {
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    website?: string;
    region?: string;
    description?: string;
    icpScore?: number;
  };
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  /** 内部透传：来自 X-Trace-Id 或自动生成 */
  traceId?: string;
}

/**
 * P0-3 Scout 信号服务。
 *
 * 流程：evidenceHash 去重（tenantId+sourceSystem+evidenceHash 已存在
 * → 返回 deduplicated:true，不重复建 Company/Lead）→ Entity Resolution
 * 找/建 Company → 自动创建 Lead（companyId 关联、icpScore 从
 * relevanceScore 映射、recommendedAction 透传、source='scout'）
 * → 写 AuditLog(actorType=AI_EMPLOYEE, source=scout)。
 *
 * icpScore 映射：relevanceScore(0-100) → icpScore(0-1)。
 */
@Injectable()
export class SignalService {
  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
    private companyService: CompanyService,
    private compliance: ComplianceService,
  ) {}

  computeEvidenceHash(input: SignalInput): string {
    if (input.evidenceHash) return input.evidenceHash;
    const canonical = [
      input.sourceSystem || 'scout',
      input.signalType,
      input.evidence || '',
      input.company?.domain || input.company?.name || '',
      input.occurredAt || '',
    ].join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  async create(tenantId: string, input: SignalInput, ctx: WorkforceContext) {
    const sourceType = input.sourceType || 'daily_batch';
    if (!['daily_batch', 'manual_submit', 'event_trigger'].includes(sourceType)) {
      throw new BadRequestException(
        'sourceType must be one of: daily_batch, manual_submit, event_trigger',
      );
    }
    if (!input.signalType) {
      throw new BadRequestException('signalType is required');
    }
    const sourceSystem = input.sourceSystem || 'scout';
    const evidenceHash = this.computeEvidenceHash(input);
    if (!evidenceHash) {
      throw new BadRequestException('evidenceHash is required');
    }

    // 1) 去重：tenantId + sourceSystem + evidenceHash
    const existing = await this.prisma.intelligenceSignal.findUnique({
      where: {
        tenantId_sourceSystem_evidenceHash: { tenantId, sourceSystem, evidenceHash },
      },
    });
    if (existing) {
      await this.audit.log({
        action: 'SIGNAL_DEDUPLICATED',
        resource: 'IntelligenceSignal',
        resourceId: existing.id,
        tenantId,
        userId: ctx.userId,
        detail: { evidenceHash, sourceType, sourceSystem },
        actorType: 'AI_EMPLOYEE',
        source: 'scout',
        traceId: ctx.traceId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return { deduplicated: true, signal: existing, traceId: ctx.traceId };
    }

    // 2) 合规校验（数据来源）
    const compliance = this.compliance.check({
      sourceType,
      credibility: input.credibility,
      signalType: input.signalType,
    });

    // 3) Entity Resolution：找/建 Company
    let company = null;
    if (input.company?.name) {
      company = await this.companyService.findOrCreate(
        tenantId,
        {
          name: input.company.name,
          domain: input.company.domain,
          industry: input.company.industry,
          size: input.company.size,
          website: input.company.website,
          region: input.company.region,
          description: input.company.description,
          source: 'scout',
          icpScore: input.company.icpScore ?? this.mapIcpScore(input.relevanceScore),
        },
        ctx,
      );
    }

    // 4) 建 Signal
    const signal = await this.prisma.intelligenceSignal.create({
      data: {
        sourceType,
        sourceSystem,
        signalType: input.signalType,
        signalStrength: input.signalStrength || 'medium',
        relevanceScore: input.relevanceScore ?? null,
        credibility: input.credibility || null,
        evidence: input.evidence || null,
        sourceUrl: input.sourceUrl || null,
        description: input.description || null,
        rawData: input.rawData ?? null,
        evidenceHash,
        recommendedAction: input.recommendedAction || null,
        status: 'detected',
        icpScore: this.mapIcpScore(input.relevanceScore),
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        companyId: company?.id || null,
        tenantId,
      },
    });

    // 5) 自动创建 Lead（companyId 关联，source='scout'）
    let lead = null;
    if (company) {
      lead = await this.prisma.lead.create({
        data: {
          name: input.contact?.name || company.name,
          email: input.contact?.email || null,
          phone: input.contact?.phone || null,
          status: 'new',
          salesStatus: 'new',
          company: company.name,
          industry: company.industry || null,
          source: 'scout',
          content: input.description || input.evidence || null,
          remark: input.recommendedAction || null,
          icpScore: this.mapIcpScore(input.relevanceScore),
          recommendedAction: input.recommendedAction || null,
          companyId: company.id,
          signalId: signal.id,
          legacySource: input.sourceSystem === 'scout' ? null : input.sourceSystem,
          legacyId: input.rawData?.legacyId || null,
          tenantId,
        },
      });
    }

    // 6) 审计
    await this.audit.log({
      action: 'SIGNAL_RECEIVED',
      resource: 'IntelligenceSignal',
      resourceId: signal.id,
      tenantId,
      userId: ctx.userId,
      detail: {
        sourceType,
        sourceSystem,
        signalType: signal.signalType,
        evidenceHash,
        companyId: company?.id || null,
        leadId: lead?.id || null,
        compliance: compliance.status,
        icpScore: signal.icpScore,
      },
      actorType: 'AI_EMPLOYEE',
      source: 'scout',
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      deduplicated: false,
      signal,
      company: company || null,
      lead: lead || null,
      compliance,
      traceId: ctx.traceId,
    };
  }

  /** relevanceScore(0-100) → icpScore(0-1) */
  mapIcpScore(relevanceScore?: number): number | null {
    if (relevanceScore == null) return null;
    return Math.max(0, Math.min(1, relevanceScore / 100));
  }

  async list(tenantId: string, query: {
    page?: number;
    limit?: number;
    status?: string;
    signalType?: string;
    sourceType?: string;
    sourceSystem?: string;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const { status, signalType, sourceType, sourceSystem, search } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (signalType) where.signalType = signalType;
    if (sourceType) where.sourceType = sourceType;
    if (sourceSystem) where.sourceSystem = sourceSystem;
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { evidence: { contains: search, mode: 'insensitive' } },
        { signalType: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.intelligenceSignal.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { detectedAt: 'desc' },
        include: {
          company: { select: { id: true, name: true, normalizedName: true, domain: true, industry: true } },
          leads: { select: { id: true, name: true, status: true, icpScore: true } },
        },
      }),
      this.prisma.intelligenceSignal.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
