import { Injectable, Logger } from '@nestjs/common';
import { LeadIntelligenceRepository } from './lead-intelligence.repository';
import { LeadIntelligencePromptBuilder } from './lead-intelligence.prompt-builder';
import { LeadIntelligenceSchema } from './lead-intelligence.schema';
import { LeadIntelligenceAudit } from './lead-intelligence.audit';
import { LeadIntelligenceThrottler } from './lead-intelligence.throttler';
import { LEAD_INTELLIGENCE_CONSTANTS } from './lead-intelligence.constants';
import {
  LeadIntelligenceError,
  LeadIntelligenceIdempotencyError,
  LeadIntelligenceNotFoundError,
} from './lead-intelligence.errors';
import { AiProviderRegistry } from '../ai/providers/ai-provider.registry';
import { AIErrorCode } from '../ai/providers/ai-provider.errors';
import { createHash } from 'node:crypto';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class LeadIntelligenceService {
  private readonly logger = new Logger(LeadIntelligenceService.name);

  constructor(
    private repository: LeadIntelligenceRepository,
    private promptBuilder: LeadIntelligencePromptBuilder,
    private schema: LeadIntelligenceSchema,
    private audit: LeadIntelligenceAudit,
    private throttler: LeadIntelligenceThrottler,
    private registry: AiProviderRegistry,
  ) {}

  /**
   * Run the AI lead analysis pipeline (P0-5B.3):
   *   Lead + Conversation → layered prompt → AIProvider.generateStructured
   *   → fail-closed validation → LeadIntelligence + LeadSignal + AnalysisRun.
   *
   * Idempotency: same (tenant, lead, inputHash, promptVersion) returns the
   * completed intelligence when a COMPLETED run exists; a new run is created
   * for retries. Failed runs are marked FAILED with a traceable error.
   */
  async analyzeLead(
    tenantId: string,
    leadId: string,
    triggerType: string,
    context: any,
    promptVersion: string = 'p0-5b.2',
  ) {
    await this.throttler.checkRateLimit(tenantId);

    const inputHash = sha256(JSON.stringify(context ?? {}));
    const idempotencyKey = sha256(
      `${tenantId}|${leadId}|${inputHash}|${promptVersion}`,
    );

    // Idempotency: a COMPLETED run for the same input returns its result.
    const existingRun = await this.repository.getLeadAnalysisRunByIdempotencyKey(
      tenantId,
      idempotencyKey,
    );
    if (existingRun) {
      if (existingRun.status === LEAD_INTELLIGENCE_CONSTANTS.STATUS.COMPLETED && existingRun.outputRef) {
        const intelligence = await this.repository.getLeadIntelligenceById(
          existingRun.outputRef,
          tenantId,
        );
        if (intelligence) {
          return intelligence;
        }
      }
      // PENDING / RUNNING / FAILED → idempotency conflict (retry must create a
      // new run with a new key; see analyzeLeadWithRetry).
      throw new LeadIntelligenceIdempotencyError();
    }

    // Load trusted context (lead + conversation) for the prompt.
    const leadContext = await this.repository.getLeadContext(tenantId, leadId);
    if (!leadContext) {
      throw new LeadIntelligenceNotFoundError('Lead not found');
    }

    const run = await this.repository.createLeadAnalysisRun({
      tenantId,
      leadId,
      triggerType,
      contextVersion: inputHash.slice(0, 16),
      promptVersion,
      idempotencyKey,
      inputHash,
      provider: this.registry.getDefaultName(),
      model: this.registry.getConfig().defaultModel || this.registry.getDefaultName(),
    });

    try {
      const { messages } = this.promptBuilder.buildAnalyzePrompt({
        tenantId,
        leadId,
        leadData: {
          name: leadContext.lead.name,
          email: leadContext.lead.email,
          company: leadContext.lead.company,
          industry: leadContext.lead.industry,
          platform: leadContext.lead.platform,
          interests: leadContext.lead.interests,
          tags: leadContext.lead.tags,
          budget: leadContext.lead.budget,
          buyingStage: leadContext.lead.buyingStage,
          urgency: leadContext.lead.urgency,
          content: leadContext.lead.content,
          remark: leadContext.lead.remark,
          preferences: leadContext.lead.preferences,
          purchaseHistory: leadContext.lead.purchaseHistory,
          ...(context ?? {}),
        },
        conversationData: leadContext.conversation
          ? {
              channel: leadContext.conversation.channel,
              messages: leadContext.conversation.messages.map((m: any) => ({
                sender: m.sender,
                content: m.content,
                createdAt: m.createdAt,
              })),
            }
          : null,
        promptVersion,
      });

      // AI call — fail-closed: any invalid output → AIResult.success=false.
      const aiResult = await this.registry.getDefault().generateStructured<any>({
        messages,
        promptVersion,
        responseSchema: this.schema.analysisOutputSchema,
        metadata: { tenantId, leadId, purpose: 'lead_analysis', requestId: run.id },
      });

      if (!aiResult.success) {
        const code = aiResult.error?.code ?? AIErrorCode.AI_INVALID_OUTPUT;
        const message = aiResult.error?.message ?? 'AI output rejected';
        await this.repository.updateLeadAnalysisRun(run.id, {
          status: LEAD_INTELLIGENCE_CONSTANTS.STATUS.FAILED,
          error: `[${code}] ${message}`,
          ...this.usageFields(aiResult.usage),
          completedAt: new Date(),
        });
        await this.audit.logAnalyzeFailure(tenantId, leadId, run.id, message);
        throw new LeadIntelligenceError(`AI analysis failed: ${message}`);
      }

      // Second gate: value-range validation + normalization.
      const validated = this.schema.validateAnalyzeResult(aiResult.data);
      if (!validated) {
        throw new LeadIntelligenceError('AI output validation failed');
      }

      // Persist intelligence snapshot.
      const intelligence = await this.repository.createLeadIntelligence({
        tenantId,
        leadId,
        runId: run.id,
        ...validated,
        modelMetadata: {
          provider: aiResult.provider,
          model: aiResult.model,
          promptVersion,
        },
      });

      // Persist signals with evidence.
      if (validated.signals) {
        for (const signal of validated.signals) {
          await this.repository.createLeadSignal({
            tenantId,
            leadId,
            runId: run.id,
            signalType: signal.signalType,
            factOrInference: signal.factOrInference,
            confidence: signal.confidence,
            evidenceText: signal.evidenceText,
            sourceRef: signal.sourceRef,
          });
        }
      }

      // Mark run COMPLETED with real usage.
      await this.repository.updateLeadAnalysisRun(run.id, {
        status: LEAD_INTELLIGENCE_CONSTANTS.STATUS.COMPLETED,
        outputRef: intelligence.id,
        ...this.usageFields(aiResult.usage),
        completedAt: new Date(),
      });

      await this.audit.logAnalyzeSuccess(tenantId, leadId, run.id);

      return intelligence;
    } catch (error) {
      // Already FAILED via explicit AI rejection above → rethrow.
      if (error instanceof LeadIntelligenceIdempotencyError) throw error;
      if (!(error instanceof LeadIntelligenceError)) {
        // provider transport error / unexpected → mark FAILED, traceable.
        await this.repository
          .updateLeadAnalysisRun(run.id, {
            status: LEAD_INTELLIGENCE_CONSTANTS.STATUS.FAILED,
            error: error.message,
            completedAt: new Date(),
          })
          .catch((e) => this.logger.error(`update FAILED failed: ${e.message}`));
        await this.audit.logAnalyzeFailure(tenantId, leadId, run.id, error.message);
      }
      throw error;
    }
  }

  /**
   * Retry helper: a retry creates a NEW AnalysisRun (traceable) rather than
   * reusing the failed one. The idempotency key is salted with a retry nonce.
   */
  async analyzeLeadWithRetry(
    tenantId: string,
    leadId: string,
    triggerType: string,
    context: any,
    promptVersion: string = 'p0-5b.2',
  ) {
    // Create a fresh run (unique idempotency key) for the retry.
    const retryNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const saltedContext = { ...(context ?? {}), __retryNonce: retryNonce };
    return this.analyzeLead(tenantId, leadId, triggerType, saltedContext, promptVersion);
  }

  // ------------------------------------------------------------------ //
  // Read API                                                            //
  // ------------------------------------------------------------------ //

  async getAnalysisRun(tenantId: string, runId: string) {
    const run = await this.repository.getLeadAnalysisRunById(runId, tenantId);
    if (!run) throw new LeadIntelligenceNotFoundError('AnalysisRun not found');
    return run;
  }

  async getAnalysisRuns(tenantId: string, leadId: string, take = 20) {
    return this.repository.listLeadAnalysisRuns(tenantId, leadId, take);
  }

  async getCurrentIntelligence(tenantId: string, leadId: string) {
    const intel = await this.repository.getCurrentLeadIntelligence(tenantId, leadId);
    if (!intel) throw new LeadIntelligenceNotFoundError('No intelligence yet');
    return intel;
  }

  async getIntelligenceHistory(tenantId: string, leadId: string, take = 20) {
    return this.repository.listLeadIntelligence(tenantId, leadId, take);
  }

  async getSignals(tenantId: string, leadId: string, take = 50) {
    return this.repository.listLeadSignals(tenantId, leadId, take);
  }

  // ------------------------------------------------------------------ //
  // helpers                                                             //
  // ------------------------------------------------------------------ //

  private usageFields(usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    usageUnavailable?: boolean;
  }): { inputTokens?: number; outputTokens?: number; totalTokens?: number } {
    if (!usage || usage.usageUnavailable) return {};
    const out: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
    if (usage.promptTokens !== undefined) out.inputTokens = usage.promptTokens;
    if (usage.completionTokens !== undefined) out.outputTokens = usage.completionTokens;
    if (usage.totalTokens !== undefined) out.totalTokens = usage.totalTokens;
    return out;
  }
}
