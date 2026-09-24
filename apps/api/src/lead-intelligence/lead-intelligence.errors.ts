export class LeadIntelligenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeadIntelligenceError';
  }
}

export class LeadIntelligenceNotFoundError extends LeadIntelligenceError {
  constructor(message: string = 'LeadIntelligence not found') {
    super(message);
    this.name = 'LeadIntelligenceNotFoundError';
  }
}

export class LeadAnalysisRunNotFoundError extends LeadIntelligenceError {
  constructor(message: string = 'LeadAnalysisRun not found') {
    super(message);
    this.name = 'LeadAnalysisRunNotFoundError';
  }
}

export class MessageDraftNotFoundError extends LeadIntelligenceError {
  constructor(message: string = 'MessageDraft not found') {
    super(message);
    this.name = 'MessageDraftNotFoundError';
  }
}

export class LeadIntelligenceTenantMismatchError extends LeadIntelligenceError {
  constructor() {
    super('Tenant mismatch');
    this.name = 'LeadIntelligenceTenantMismatchError';
  }
}

export class LeadIntelligenceIdempotencyError extends LeadIntelligenceError {
  constructor() {
    super('Idempotency key conflict');
    this.name = 'LeadIntelligenceIdempotencyError';
  }
}
