import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkforceContext } from '../workforce.types';

export interface CreateOpportunityInput {
  leadId?: string;
  companyId?: string;
  title?: string;
  description?: string;
  status?: string;
  stage?: string;
  outcome?: string;
  leadScore?: number;
  leadGrade?: string;
  qualificationData?: any;
  scoringModel?: string;
  scoreExplanation?: any;
  amount?: number;
  currency?: string;
  priority?: number;
  nextFollowUpAt?: string;
  conversationId?: string;
}

/**
 * P0-3 Opportunity 服务。
 *
 * 从 Qualified Lead 创建商机：leadId 关联时自动带出 companyId /
 * conversationId / leadScore / leadGrade；qualificationData 可扩展结构，
 * scoringModel 标识评分模型。
 */
@Injectable()
export class OpportunityService {
  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
  ) {}

  async create(tenantId: string, input: CreateOpportunityInput, ctx: WorkforceContext) {
    let lead: any = null;
    if (input.leadId) {
      lead = await this.prisma.lead.findFirst({
        where: { id: input.leadId, tenantId },
        include: { companyRef: true, signal: true },
      });
      if (!lead) throw new NotFoundException('Lead not found');
    }

    const companyId = input.companyId || lead?.companyId || lead?.companyRef?.id || null;
    if (!companyId) {
      throw new BadRequestException(
        'Opportunity requires a company: provide companyId or create from a lead with company',
      );
    }

    const opportunity = await this.prisma.opportunity.create({
      data: {
        title: input.title || lead?.company || lead?.name || '未命名商机',
        description: input.description || lead?.content || null,
        status: input.status || 'new',
        stage: input.stage || lead?.status || 'new',
        outcome: input.outcome || null,
        leadScore: input.leadScore ?? lead?.icpScore ?? 0,
        leadGrade: input.leadGrade || (lead?.icpScore != null ? this.grade(lead.icpScore) : 'D'),
        qualificationData: input.qualificationData ?? null,
        scoringModel: input.scoringModel || null,
        scoreExplanation: input.scoreExplanation ?? null,
        amount: input.amount ?? null,
        currency: input.currency || 'CNY',
        priority: input.priority ?? 0,
        nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
        tenantId,
        companyId,
        leadId: input.leadId || null,
        conversationId: input.conversationId || lead?.conversationId || null,
      },
    });

    await this.audit.log({
      action: 'OPPORTUNITY_CREATE',
      resource: 'Opportunity',
      resourceId: opportunity.id,
      tenantId,
      userId: ctx.userId,
      detail: {
        title: opportunity.title,
        companyId,
        leadId: opportunity.leadId,
        leadScore: opportunity.leadScore,
        leadGrade: opportunity.leadGrade,
        scoringModel: opportunity.scoringModel,
        amount: opportunity.amount,
        currency: opportunity.currency,
      },
      actorType: ctx.actorType,
      source: ctx.source || 'hunter',
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return opportunity;
  }

  /** icpScore(0-1) → 等级 A/B/C/D */
  grade(icpScore: number): string {
    if (icpScore >= 0.8) return 'A';
    if (icpScore >= 0.6) return 'B';
    if (icpScore >= 0.4) return 'C';
    return 'D';
  }

  async list(tenantId: string, query: {
    page?: number;
    limit?: number;
    status?: string;
    stage?: string;
    companyId?: string;
    leadId?: string;
    search?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const { status, stage, companyId, leadId, search } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (stage) where.stage = stage;
    if (companyId) where.companyId = companyId;
    if (leadId) where.leadId = leadId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: { select: { id: true, name: true, domain: true, industry: true } },
          lead: { select: { id: true, name: true, status: true } },
          conversation: { select: { id: true, channel: true } },
        },
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
