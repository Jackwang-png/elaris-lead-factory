import { Controller, Post, Body, Param, Get, Query, UseGuards } from '@nestjs/common';
import { LeadIntelligenceService } from './lead-intelligence.service';
import { MessageDraftService } from './message-draft.service';
import { WorkforceTenantGuard } from '../workforce/workforce-tenant.guard';
import { RequireScope, WorkforceTenant } from '../workforce/workforce.decorators';
import { WorkforceContext } from '../workforce/workforce.types';
import { LEAD_INTELLIGENCE_CONSTANTS as C } from './lead-intelligence.constants';

/**
 * P0-5B.3 — Lead Intelligence API (/api/v2 style).
 *
 * Tenant identity comes exclusively from @WorkforceTenant() (guard-injected
 * trusted context). Body/query never carry tenantId; cross-tenant reads
 * fail closed (404 / mismatch error).
 */
@Controller('api/v2/leads/:leadId/intelligence')
@UseGuards(WorkforceTenantGuard)
export class LeadIntelligenceController {
  constructor(
    private leadIntelligenceService: LeadIntelligenceService,
    private messageDraftService: MessageDraftService,
  ) {}

  /** Trigger analysis. Idempotent per (tenant, lead, inputHash, promptVersion). */
  @Post('analysis')
  @RequireScope('leads:write', 'service:scout', 'service:hunter')
  async analyzeLead(
    @Param('leadId') leadId: string,
    @WorkforceTenant() ctx: WorkforceContext,
    @Body() body: { triggerType?: string; context?: any; promptVersion?: string; retry?: boolean },
  ) {
    const triggerType = body.triggerType || C.TRIGGER_TYPES.MANUAL;
    if (body.retry) {
      return this.leadIntelligenceService.analyzeLeadWithRetry(
        ctx.tenantId,
        leadId,
        triggerType,
        body.context,
        body.promptVersion,
      );
    }
    return this.leadIntelligenceService.analyzeLead(
      ctx.tenantId,
      leadId,
      triggerType,
      body.context,
      body.promptVersion,
    );
  }

  /** AnalysisRun history for the lead. */
  @Get('analysis')
  @RequireScope('leads:read', 'service:scout', 'service:hunter')
  async getAnalysisRuns(
    @Param('leadId') leadId: string,
    @WorkforceTenant() ctx: WorkforceContext,
    @Query('take') take?: string,
  ) {
    return this.leadIntelligenceService.getAnalysisRuns(
      ctx.tenantId,
      leadId,
      take ? Math.min(Number(take) || 20, 100) : 20,
    );
  }

  /** Single AnalysisRun. */
  @Get('analysis/:runId')
  @RequireScope('leads:read', 'service:scout', 'service:hunter')
  async getAnalysisRun(
    @Param('leadId') leadId: string,
    @Param('runId') runId: string,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadIntelligenceService.getAnalysisRun(ctx.tenantId, runId);
  }

  /** Current intelligence snapshot. */
  @Get('current')
  @RequireScope('leads:read', 'service:scout', 'service:hunter')
  async getCurrentIntelligence(
    @Param('leadId') leadId: string,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadIntelligenceService.getCurrentIntelligence(ctx.tenantId, leadId);
  }

  /** Intelligence history. */
  @Get('history')
  @RequireScope('leads:read', 'service:scout', 'service:hunter')
  async getIntelligenceHistory(
    @Param('leadId') leadId: string,
    @WorkforceTenant() ctx: WorkforceContext,
    @Query('take') take?: string,
  ) {
    return this.leadIntelligenceService.getIntelligenceHistory(
      ctx.tenantId,
      leadId,
      take ? Math.min(Number(take) || 20, 100) : 20,
    );
  }

  /** Signals (with evidence) for the lead. */
  @Get('signals')
  @RequireScope('leads:read', 'service:scout', 'service:hunter')
  async getSignals(
    @Param('leadId') leadId: string,
    @WorkforceTenant() ctx: WorkforceContext,
    @Query('take') take?: string,
  ) {
    return this.leadIntelligenceService.getSignals(
      ctx.tenantId,
      leadId,
      take ? Math.min(Number(take) || 50, 200) : 50,
    );
  }

  /** Draft generation — contract only, NO sending (P0-5C). */
  @Post('drafts/generate')
  @RequireScope('leads:write', 'service:scout')
  async generateDraft(
    @Param('leadId') leadId: string,
    @WorkforceTenant() ctx: WorkforceContext,
    @Body() body: { analysisRunId: string; context?: any; promptVersion?: string },
  ) {
    return this.messageDraftService.generateDraft(
      ctx.tenantId,
      leadId,
      body.analysisRunId,
      body.context,
      body.promptVersion,
    );
  }

  /** Request human approval for a draft (reuses P0-4 approval flow). */
  @Post('drafts/:draftId/request-approval')
  @RequireScope('approvals:write')
  async requestApproval(
    @Param('draftId') draftId: string,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.messageDraftService.requestApproval(draftId, ctx.tenantId);
  }
}
