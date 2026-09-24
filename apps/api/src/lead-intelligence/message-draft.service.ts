import { Injectable, Logger } from '@nestjs/common';
import { LeadIntelligenceRepository } from './lead-intelligence.repository';
import { LeadIntelligencePromptBuilder } from './lead-intelligence.prompt-builder';
import { LeadIntelligenceSchema } from './lead-intelligence.schema';
import { LeadIntelligenceAudit } from './lead-intelligence.audit';
import { LEAD_INTELLIGENCE_CONSTANTS } from './lead-intelligence.constants';
import { LeadIntelligenceError } from './lead-intelligence.errors';
import { AiProviderRegistry } from '../ai/providers/ai-provider.registry';

/**
 * MessageDraft — future output contract ONLY. No sending, no outreach,
 * no platform delivery (P0-5C). Draft generation is AI-driven with the
 * same fail-closed structured-output discipline as analysis.
 */
@Injectable()
export class MessageDraftService {
  private readonly logger = new Logger(MessageDraftService.name);

  constructor(
    private repository: LeadIntelligenceRepository,
    private promptBuilder: LeadIntelligencePromptBuilder,
    private schema: LeadIntelligenceSchema,
    private audit: LeadIntelligenceAudit,
    private registry: AiProviderRegistry,
  ) {}

  async generateDraft(
    tenantId: string,
    leadId: string,
    analysisRunId: string,
    context: any,
    promptVersion: string = 'p0-5b.2',
  ) {
    const leadContext = await this.repository.getLeadContext(tenantId, leadId);
    if (!leadContext) {
      throw new LeadIntelligenceError('Lead not found');
    }

    const { messages } = this.promptBuilder.buildGeneratePrompt({
      tenantId,
      leadId,
      leadData: {
        name: leadContext.lead.name,
        email: leadContext.lead.email,
        company: leadContext.lead.company,
        industry: leadContext.lead.industry,
        interests: leadContext.lead.interests,
        buyingStage: leadContext.lead.buyingStage,
        ...(context ?? {}),
      },
      intelligenceData: context?.intelligence,
      promptVersion,
    });

    const aiResult = await this.registry.getDefault().generateStructured<any>({
      messages,
      promptVersion,
      responseSchema: this.schema.draftOutputSchema,
      metadata: { tenantId, leadId, purpose: 'message_draft', requestId: analysisRunId },
    });

    if (!aiResult.success) {
      throw new LeadIntelligenceError(
        `Draft generation failed: ${aiResult.error?.message ?? 'invalid AI output'}`,
      );
    }

    // Second gate
    const validated = this.schema.validateGenerateResult(aiResult.data);
    if (!validated) {
      throw new LeadIntelligenceError('Draft output validation failed');
    }

    const draft = await this.repository.createMessageDraft({
      tenantId,
      leadId,
      analysisRunId,
      draftType: validated.draftType,
      riskLevel: validated.riskLevel,
      content: validated.content,
      reasoning: validated.reasoning,
    });

    await this.audit.logGenerateSuccess(tenantId, leadId, draft.id);

    return draft;
  }

  async requestApproval(draftId: string, tenantId: string) {
    const draft = await this.repository.getMessageDraftById(draftId, tenantId);
    if (!draft) {
      throw new LeadIntelligenceError('MessageDraft not found');
    }

    // P0-5B.2/3: mock approvalId (real P0-4 Approval integration in P0-5C)
    const approvalId = 'mock-approval-id';

    await this.repository.updateMessageDraft(draftId, {
      status: LEAD_INTELLIGENCE_CONSTANTS.DRAFT_STATUS.REVIEW_REQUIRED,
      approvalId,
    });

    await this.audit.logApprovalRequested(tenantId, draft.leadId, draftId, approvalId);

    return { ...draft, status: LEAD_INTELLIGENCE_CONSTANTS.DRAFT_STATUS.REVIEW_REQUIRED, approvalId };
  }
}
