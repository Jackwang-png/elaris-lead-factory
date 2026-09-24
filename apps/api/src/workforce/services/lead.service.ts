import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { HumanControlService } from './human-control.service';
import { ComplianceService } from './compliance.service';
import { ApprovalService } from './approval.service';
import { WorkforceContext } from '../workforce.types';

export interface CreateLeadInput {
  name?: string;
  email?: string;
  phone?: string;
  // B2B：companyId；B2C：contactId（即 customerId）。至少一个必填。
  companyId?: string;
  contactId?: string;
  companyName?: string;
  status?: string;
  source?: string;
  icpScore?: number;
  recommendedAction?: string;
  signalId?: string;
  conversationId?: string;
  industry?: string;
  interests?: string[];
  tags?: string[];
  content?: string;
  remark?: string;
}

export const LEAD_STATUS_FLOW: Record<string, string[]> = {
  new: ['qualified', 'lost'],
  qualified: ['handoff', 'won', 'lost'],
  handoff: ['won', 'lost', 'qualified'],
  won: [],
  lost: [],
};

/**
 * P0-3 Lead 服务（v2）。
 *
 * 状态机：new → qualified → handoff → won/lost（非法跳转 400）。
 * qualified 时记录 qualifiedBy / qualifiedAt。
 * hunter-queue：Human Control —— 默认需人工确认（PENDING_APPROVAL 审计），
 * HUNTER_AUTO_APPROVE / AUTO_APPROVE 环境变量可跳过。
 */
@Injectable()
export class LeadService {
  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
    private humanControl: HumanControlService,
    private compliance: ComplianceService,
    private approval: ApprovalService,
  ) {}

  async create(tenantId: string, input: CreateLeadInput, ctx: WorkforceContext) {
    if (!input.companyId && !input.contactId && !input.companyName) {
      throw new BadRequestException(
        'At least one of companyId (B2B) / contactId (B2C) / companyName is required',
      );
    }

    // 校验关联存在性（tenant 内）
    if (input.companyId) {
      const c = await this.prisma.company.findFirst({
        where: { id: input.companyId, tenantId },
        select: { id: true, name: true },
      });
      if (!c) throw new BadRequestException('companyId not found in tenant');
      if (!input.companyName) input.companyName = c.name;
    }
    if (input.contactId) {
      const cu = await this.prisma.customer.findFirst({
        where: { id: input.contactId, tenantId },
        select: { id: true, name: true },
      });
      if (!cu) throw new BadRequestException('contactId not found in tenant');
    }

    const lead = await this.prisma.lead.create({
      data: {
        name: input.name || input.companyName || '未命名线索',
        email: input.email || null,
        phone: input.phone || null,
        status: input.status || 'new',
        salesStatus: input.status || 'new',
        company: input.companyName || null,
        industry: input.industry || null,
        source: input.source || 'api',
        interests: input.interests || [],
        tags: input.tags || [],
        content: input.content || null,
        remark: input.remark || null,
        icpScore: input.icpScore ?? null,
        recommendedAction: input.recommendedAction || null,
        companyId: input.companyId || null,
        signalId: input.signalId || null,
        conversationId: input.conversationId || null,
        customerId: input.contactId || null,
        tenantId,
      },
    });

    await this.audit.log({
      action: 'LEAD_CREATE',
      resource: 'Lead',
      resourceId: lead.id,
      tenantId,
      userId: ctx.userId,
      detail: {
        name: lead.name,
        companyId: lead.companyId,
        contactId: lead.customerId,
        source: lead.source,
        icpScore: lead.icpScore,
      },
      actorType: ctx.actorType,
      source: ctx.source,
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return lead;
  }

  async list(tenantId: string, query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    source?: string;
    companyId?: string;
    minIcpScore?: number;
    signalId?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const { search, status, source, companyId, signalId } = query;
    const minIcpScore = query.minIcpScore != null ? Number(query.minIcpScore) : undefined;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (source) where.source = source;
    if (companyId) where.companyId = companyId;
    if (signalId) where.signalId = signalId;
    if (minIcpScore != null) where.icpScore = { gte: Number(minIcpScore) };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          companyRef: { select: { id: true, name: true, normalizedName: true, domain: true, industry: true } },
          signal: { select: { id: true, signalType: true, signalStrength: true, relevanceScore: true, evidenceHash: true } },
          customer: { select: { id: true, name: true, email: true, phone: true } },
          opportunities: { select: { id: true, title: true, status: true, stage: true, amount: true, currency: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getById(tenantId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: {
        companyRef: true,
        signal: true,
        customer: true,
        conversation: { include: { messages: { orderBy: { createdAt: 'asc' }, take: 20 } } },
        opportunities: true,
        scoreHistory: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  /** 状态推进：new→qualified→handoff→won/lost */
  async updateStatus(tenantId: string, id: string, status: string, ctx: WorkforceContext, reason?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId } });
    if (!lead) throw new NotFoundException('Lead not found');

    const allowed = LEAD_STATUS_FLOW[lead.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Invalid status transition: ${lead.status} -> ${status} (allowed: ${allowed.join(', ') || 'none'})`,
      );
    }

    const data: any = {
      status,
      salesStatus: status,
      updatedAt: new Date(),
    };
    if (status === 'qualified') {
      data.qualifiedBy = ctx.userId || `system:${ctx.source || 'api'}`;
      data.qualifiedAt = new Date();
    }

    const updated = await this.prisma.lead.update({ where: { id }, data });

    await this.audit.log({
      action: 'LEAD_STATUS_UPDATE',
      resource: 'Lead',
      resourceId: id,
      tenantId,
      userId: ctx.userId,
      detail: { from: lead.status, to: status, reason: reason || null, qualifiedBy: data.qualifiedBy || null },
      actorType: ctx.actorType,
      source: ctx.source,
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return updated;
  }

  /**
   * Lead 进入 Hunter 队列。
   * Human Control：默认需人工确认（写 PENDING_APPROVAL 审计）；
   * HUNTER_AUTO_APPROVE / AUTO_APPROVE 环境变量 = true 时跳过。
   * 外联前一律要求 approved 状态（见 HumanControlService.classify）。
   */
  async enqueueHunter(tenantId: string, id: string, ctx: WorkforceContext, payload?: any) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, tenantId },
      include: { signal: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    // P0-4.3 Compliance Gate：payload 声明外联/批量时强制合规校验，rejected → 硬阻断
    const isOutreachIntent =
      (payload?.action && /OUTREACH|EXTERNAL_?CONTACT|BULK/i.test(String(payload.action))) ||
      (payload?.batch && payload.batch > 1);
    if (isOutreachIntent) {
      const compliance = this.compliance.check({
        action: payload?.batch && payload.batch > 1 ? 'bulk_outreach' : 'external_contact',
        credibility: lead.signal?.credibility,
        signalType: lead.signal?.signalType,
        detail: { leadId: lead.id },
      });
      if (compliance.status === 'rejected') {
        await this.audit.log({
          action: 'COMPLIANCE_BLOCKED',
          resource: 'Lead',
          resourceId: lead.id,
          tenantId,
          userId: ctx.userId,
          detail: { reason: compliance.reason, checks: compliance.checks, stage: 'hunter_queue' },
          success: false,
          failureReason: compliance.reason,
          actorType: ctx.actorType,
          source: ctx.source || 'hunter',
          traceId: ctx.traceId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        throw new ForbiddenException(`Compliance gate: ${compliance.reason}`);
      }
    }

    const { decision, approvalRequired, autoApproved } = this.humanControl.decide(
      'HUNTER_QUEUE',
      payload,
    );

    await this.audit.log({
      action: approvalRequired ? 'HUNTER_QUEUE_PENDING_APPROVAL' : 'HUNTER_QUEUE_APPROVED',
      resource: 'Lead',
      resourceId: id,
      tenantId,
      userId: ctx.userId,
      detail: {
        riskLevel: decision.level,
        mode: decision.mode,
        reason: decision.reason,
        autoApproved,
        leadStatus: lead.status,
      },
      actorType: ctx.actorType,
      source: ctx.source || 'hunter',
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    if (approvalRequired) {
      // P0-4.4：创建真实审批记录，返回 approvalId 供人工审批
      const approval = await this.approval.request({
        tenantId,
        action: 'HUNTER_QUEUE',
        targetType: 'Lead',
        targetId: lead.id,
        riskLevel: decision.level,
        reason: decision.reason,
        traceId: ctx.traceId,
        requestedBy: ctx.userId,
        source: ctx.source || 'hunter',
        actorType: ctx.actorType,
      });
      return {
        approved: false,
        approvalRequired: true,
        status: 'PENDING_APPROVAL',
        approvalId: approval.approvalId,
        riskLevel: decision.level,
        reason: decision.reason,
        lead: { id: lead.id, status: lead.status },
        traceId: ctx.traceId,
      };
    }

    // 已放行：状态推进到 handoff（进入 Hunter 队列）
    const data: any = { status: 'handoff', salesStatus: 'handoff' };
    if (lead.status === 'new') {
      data.qualifiedBy = ctx.userId || `system:${ctx.source || 'api'}`;
      data.qualifiedAt = new Date();
    }
    const updated = await this.prisma.lead.update({ where: { id }, data });

    return {
      approved: true,
      approvalRequired: false,
      status: 'handoff',
      riskLevel: decision.level,
      lead: updated,
      traceId: ctx.traceId,
    };
  }
}
