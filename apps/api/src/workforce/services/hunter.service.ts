import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { ComplianceService } from './compliance.service';
import { HumanControlService } from './human-control.service';
import { ApprovalService } from './approval.service';
import { WorkforceContext } from '../workforce.types';

export interface HunterQualifiedInput {
  leadId: string;
  qualification?: {
    score?: number;
    grade?: string;
    summary?: string;
    criteria?: any;
    scoringModel?: string;
    scoreExplanation?: any;
  };
  research?: any;
  conversationHistory?: any[];
  recommendedStrategy?: any;
  /** 可选：显式指定支持渠道（默认 hunter） */
  channel?: string;
  /** 可选：需要人工介入时置 true（needsHuman） */
  needsHuman?: boolean;
  handoffReason?: string;
  contact?: { name?: string; email?: string; phone?: string };
}

/**
 * P0-3 Hunter 服务 —— Hunter→Support 交接点。
 *
 * POST /hunter/qualified：Hunter 判定 Qualified Lead →
 *   1. Compliance 外联前置校验（外部发送类操作默认 PENDING_APPROVAL，不做全自动发送）
 *   2. 自动创建/更新 Customer(=Contact)（companyId/source='hunter'/icpScore 关联）
 *   3. 创建 Conversation（channel='hunter'，needsHuman 按需）
 *   4. 完整上下文（icpScore/qualification/research/conversationHistory/
 *      recommendedStrategy）写入 Conversation 下 Message.metadata
 *   5. Lead 关联 customerId/conversationId，状态 → handoff
 *   6. AuditLog(actorType=AI_EMPLOYEE, source=hunter)
 *
 * POST /hunter/handoff：显式交接，复用同一逻辑（action 记录为 HUNTER_HANDOFF）。
 */
@Injectable()
export class HunterService {
  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
    private compliance: ComplianceService,
    private humanControl: HumanControlService,
    private approval: ApprovalService,
  ) {}

  async qualified(tenantId: string, input: HunterQualifiedInput, ctx: WorkforceContext, explicit = false) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: input.leadId, tenantId },
      include: { companyRef: true, signal: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    // Human Control：外联/交接属中高风险，默认需审批；AUTO_APPROVE 可跳过
    const { decision, approvalRequired, autoApproved } = this.humanControl.decide(
      explicit ? 'HANDOFF' : 'QUALIF',
      { channel: input.channel || 'hunter' },
    );

    // Compliance：数据来源 + 外联前置
    const compliance = this.compliance.check({
      action: 'external_contact',
      credibility: lead.signal?.credibility,
      signalType: lead.signal?.signalType,
      detail: { leadId: lead.id },
    });

    // P0-4.3 Compliance Gate 强化：rejected（来源不可信/敏感信号类型）→ 硬阻断，
    // 不得进入后续外联/交接流程（写审计，不泄露内部细节给调用方）。
    if (compliance.status === 'rejected') {
      await this.audit.log({
        action: 'COMPLIANCE_BLOCKED',
        resource: 'Lead',
        resourceId: lead.id,
        tenantId,
        userId: ctx.userId,
        detail: { reason: compliance.reason, checks: compliance.checks, stage: 'hunter_handoff' },
        success: false,
        failureReason: compliance.reason,
        actorType: 'AI_EMPLOYEE',
        source: 'hunter',
        traceId: ctx.traceId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new ForbiddenException(`Compliance gate: ${compliance.reason}`);
    }

    const approval = {
      approvalRequired,
      autoApproved,
      riskLevel: decision.level,
      complianceStatus: compliance.status,
      externalContactBlocked: approvalRequired,
    };

    if (approvalRequired) {
      // P0-4.4：创建真实审批记录（事件溯源 AuditLog），返回 approvalId 供人工审批
      const approval = await this.approval.request({
        tenantId,
        action: explicit ? 'HUNTER_HANDOFF' : 'HUNTER_QUALIFIED',
        targetType: 'Lead',
        targetId: lead.id,
        riskLevel: decision.level,
        reason: decision.reason,
        traceId: ctx.traceId,
        requestedBy: ctx.userId,
        source: 'hunter',
        actorType: 'AI_EMPLOYEE',
      });
      await this.audit.log({
        action: explicit ? 'HUNTER_HANDOFF_PENDING_APPROVAL' : 'HUNTER_QUALIFIED_PENDING_APPROVAL',
        resource: 'Lead',
        resourceId: lead.id,
        tenantId,
        userId: ctx.userId,
        detail: {
          approvalId: approval.approvalId,
          riskLevel: decision.level,
          reason: decision.reason,
          compliance: compliance.status,
        },
        actorType: 'AI_EMPLOYEE',
        source: 'hunter',
        traceId: ctx.traceId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        approved: false,
        approvalRequired: true,
        status: 'PENDING_APPROVAL',
        approvalId: approval.approvalId,
        reason: 'External outreach / handoff requires human approval',
        lead: { id: lead.id, status: lead.status },
        traceId: ctx.traceId,
      };
    }

    // 1) Customer(=Contact)：存在则更新，否则新建
    let customer = lead.customerId
      ? await this.prisma.customer.findFirst({ where: { id: lead.customerId, tenantId } })
      : null;
    if (!customer && lead.email) {
      customer = await this.prisma.customer.findFirst({
        where: { tenantId, email: lead.email },
      });
    }
    const customerData = {
      name: input.contact?.name || customer?.name || lead.name || lead.company || 'Qualified Lead',
      email: input.contact?.email || lead.email || customer?.email || null,
      phone: input.contact?.phone || lead.phone || customer?.phone || null,
      companyId: lead.companyId || null,
      source: 'hunter',
      role: 'decision_maker',
      icpScore: lead.icpScore ?? null,
      stage: 'qualified',
      tenantId,
    };
    customer = customer
      ? await this.prisma.customer.update({ where: { id: customer.id }, data: customerData })
      : await this.prisma.customer.create({ data: customerData });

    // 2) Conversation（Hunter→Support 交接载体）
    const conversation = await this.prisma.conversation.create({
      data: {
        channel: input.channel || 'hunter',
        channelId: `hunter:${lead.id}`,
        visitor: customer.name,
        customerId: customer.id,
        needsHuman: input.needsHuman ?? true,
        handoffReason: input.handoffReason || 'hunter_qualified_handoff',
        handoffAt: new Date(),
        tenantId,
      },
    });

    // 3) 完整上下文写入 Message.metadata（Conversation 无 metadata 列，按需求存 message）
    const contextPayload = {
      type: 'hunter_handoff',
      icpScore: lead.icpScore,
      qualification: input.qualification || null,
      research: input.research || null,
      conversationHistory: input.conversationHistory || null,
      recommendedStrategy: input.recommendedStrategy || null,
      company: lead.companyRef
        ? { id: lead.companyRef.id, name: lead.companyRef.name, domain: lead.companyRef.domain, industry: lead.companyRef.industry }
        : null,
      scoringModel: input.qualification?.scoringModel || null,
      scoreExplanation: input.qualification?.scoreExplanation || null,
    };
    await this.prisma.message.create({
      data: {
        content:
          input.qualification?.summary ||
          `Hunter 判定 Qualified Lead（${input.qualification?.grade || lead.status}），交接至 Support 团队。`,
        sender: 'bot',
        direction: 'inbound',
        role: 'system',
        conversationId: conversation.id,
        tenantId,
        metadata: contextPayload,
      },
    });

    // 4) Lead 关联 + 状态 → handoff
    const data: any = {
      customerId: customer.id,
      conversationId: conversation.id,
      status: 'handoff',
      salesStatus: 'handoff',
    };
    if (!lead.qualifiedAt) {
      data.qualifiedBy = ctx.userId || `system:${ctx.source || 'hunter'}`;
      data.qualifiedAt = new Date();
    }
    const updatedLead = await this.prisma.lead.update({ where: { id: lead.id }, data });

    // 5) 审计
    await this.audit.log({
      action: explicit ? 'HUNTER_HANDOFF' : 'HUNTER_QUALIFIED',
      resource: 'Lead',
      resourceId: lead.id,
      tenantId,
      userId: ctx.userId,
      detail: {
        customerId: customer.id,
        conversationId: conversation.id,
        icpScore: lead.icpScore,
        grade: input.qualification?.grade || null,
        score: input.qualification?.score || null,
        scoringModel: input.qualification?.scoringModel || null,
        compliance: compliance.status,
        approval: { approvalRequired, autoApproved, riskLevel: decision.level },
      },
      actorType: 'AI_EMPLOYEE',
      source: 'hunter',
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      approved: true,
      approvalRequired: false,
      customer,
      conversation,
      lead: updatedLead,
      context: { traceId: ctx.traceId, scoringModel: input.qualification?.scoringModel || null },
    };
  }
}
