import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeadIntelligenceTenantMismatchError } from './lead-intelligence.errors';
import { LEAD_INTELLIGENCE_CONSTANTS } from './lead-intelligence.constants';

@Injectable()
export class LeadIntelligenceRepository {
  private readonly logger = new Logger(LeadIntelligenceRepository.name);

  constructor(private prisma: PrismaService) {}

  // ------------------------------------------------------------------ //
  // LeadAnalysisRun                                                    //
  // ------------------------------------------------------------------ //

  async createLeadAnalysisRun(data: {
    tenantId: string;
    leadId: string;
    triggerType: string;
    contextVersion: string;
    promptVersion: string;
    idempotencyKey: string;
    inputHash: string;
    provider: string;
    model: string;
  }) {
    return this.prisma.leadAnalysisRun.create({
      data: {
        ...data,
        status: LEAD_INTELLIGENCE_CONSTANTS.STATUS.PENDING,
      },
    });
  }

  async updateLeadAnalysisRun(id: string, data: {
    status?: string;
    outputRef?: string;
    error?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    retryCount?: number;
    completedAt?: Date;
  }) {
    return this.prisma.leadAnalysisRun.update({
      where: { id },
      data,
    });
  }

  async getLeadAnalysisRunById(id: string, tenantId: string) {
    const run = await this.prisma.leadAnalysisRun.findUnique({
      where: { id },
    });
    if (!run) return null;
    if (run.tenantId !== tenantId) {
      throw new LeadIntelligenceTenantMismatchError();
    }
    return run;
  }

  async getLeadAnalysisRunByIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ) {
    return this.prisma.leadAnalysisRun.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
    });
  }

  /** AnalysisRun history for a lead (tenant-scoped, newest first). */
  async listLeadAnalysisRuns(tenantId: string, leadId: string, take = 20) {
    return this.prisma.leadAnalysisRun.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ------------------------------------------------------------------ //
  // LeadIntelligence                                                   //
  // ------------------------------------------------------------------ //

  async createLeadIntelligence(data: {
    tenantId: string;
    leadId: string;
    runId: string;
    leadScore?: number;
    fitScore?: number;
    intentScore?: number;
    priority?: string;
    observed?: any;
    inferred?: any;
    unknowns?: any;
    signals?: any;
    painPoints?: any;
    recommendedAction?: string;
    suggestedStrategy?: any;
    reasoningSummary?: string;
    modelMetadata?: any;
  }) {
    return this.prisma.leadIntelligence.create({
      data,
    });
  }

  async getLeadIntelligenceById(id: string, tenantId: string) {
    const intelligence = await this.prisma.leadIntelligence.findUnique({
      where: { id },
    });
    if (!intelligence) return null;
    if (intelligence.tenantId !== tenantId) {
      throw new LeadIntelligenceTenantMismatchError();
    }
    return intelligence;
  }

  /** Latest intelligence snapshot for a lead (tenant-scoped). */
  async getCurrentLeadIntelligence(tenantId: string, leadId: string) {
    return this.prisma.leadIntelligence.findFirst({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Intelligence history for a lead (tenant-scoped, newest first). */
  async listLeadIntelligence(tenantId: string, leadId: string, take = 20) {
    return this.prisma.leadIntelligence.findMany({
      where: { tenantId, leadId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ------------------------------------------------------------------ //
  // LeadSignal                                                         //
  // ------------------------------------------------------------------ //

  async createLeadSignal(data: {
    tenantId: string;
    leadId: string;
    runId?: string;
    signalType: string;
    factOrInference: string;
    confidence?: string;
    evidenceText?: string;
    sourceRef?: string;
  }) {
    return this.prisma.leadSignal.create({
      data,
    });
  }

  /** Signals for a lead (tenant-scoped, newest first). */
  async listLeadSignals(tenantId: string, leadId: string, take = 50) {
    return this.prisma.leadSignal.findMany({
      where: { tenantId, leadId },
      orderBy: { observedAt: 'desc' },
      take,
    });
  }

  // ------------------------------------------------------------------ //
  // Lead + Conversation data (trusted context for the prompt)          //
  // ------------------------------------------------------------------ //

  /** Load lead + its conversation messages (tenant-scoped). */
  async getLeadContext(tenantId: string, leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
    });
    if (!lead || lead.tenantId !== tenantId) {
      return null;
    }
    let conversation = null;
    if (lead.conversationId) {
      conversation = await this.prisma.conversation.findUnique({
        where: { id: lead.conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });
    }
    return { lead, conversation };
  }

  // ------------------------------------------------------------------ //
  // MessageDraft                                                       //
  // ------------------------------------------------------------------ //

  async createMessageDraft(data: {
    tenantId: string;
    leadId: string;
    analysisRunId?: string;
    status?: string;
    draftType: string;
    riskLevel: string;
    content: any;
    reasoning?: string;
    approvalId?: string;
    expiresAt?: Date;
  }) {
    return this.prisma.messageDraft.create({
      data: {
        ...data,
        status: data.status || LEAD_INTELLIGENCE_CONSTANTS.DRAFT_STATUS.GENERATED,
      },
    });
  }

  async updateMessageDraft(id: string, data: {
    status?: string;
    approvalId?: string;
    expiresAt?: Date;
  }) {
    return this.prisma.messageDraft.update({
      where: { id },
      data,
    });
  }

  async getMessageDraftById(id: string, tenantId: string) {
    const draft = await this.prisma.messageDraft.findUnique({
      where: { id },
    });
    if (!draft) return null;
    if (draft.tenantId !== tenantId) {
      throw new LeadIntelligenceTenantMismatchError();
    }
    return draft;
  }
}
