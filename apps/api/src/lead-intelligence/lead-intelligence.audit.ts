import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class LeadIntelligenceAudit {
  private readonly logger = new Logger(LeadIntelligenceAudit.name);

  constructor(private auditService: AuditService) {}

  async logAnalyzeSuccess(tenantId: string, leadId: string, runId: string) {
    await this.auditService.log({
      tenantId,
      action: 'ANALYZE_LEAD_SUCCESS',
      resource: 'LeadAnalysisRun',
      resourceId: runId,
      detail: { leadId },
    });
  }

  async logAnalyzeFailure(tenantId: string, leadId: string, runId: string, error: string) {
    await this.auditService.log({
      tenantId,
      action: 'ANALYZE_LEAD_FAILURE',
      resource: 'LeadAnalysisRun',
      resourceId: runId,
      detail: { leadId, error },
      success: false,
      failureReason: error,
    });
  }

  async logGenerateSuccess(tenantId: string, leadId: string, draftId: string) {
    await this.auditService.log({
      tenantId,
      action: 'GENERATE_DRAFT_SUCCESS',
      resource: 'MessageDraft',
      resourceId: draftId,
      detail: { leadId },
    });
  }

  async logApprovalRequested(tenantId: string, leadId: string, draftId: string, approvalId: string) {
    await this.auditService.log({
      tenantId,
      action: 'REQUEST_APPROVAL',
      resource: 'MessageDraft',
      resourceId: draftId,
      detail: { leadId, approvalId },
    });
  }
}
