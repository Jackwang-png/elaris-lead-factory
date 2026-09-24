export type AnalyzeResult = {
  leadScore?: number;
  fitScore?: number;
  intentScore?: number;
  priority?: string;
  observed?: any;
  inferred?: any;
  unknowns?: any;
  signals?: LeadSignal[];
  painPoints?: any;
  recommendedAction?: string;
  suggestedStrategy?: any;
  modelMetadata?: any;
};

export type LeadSignal = {
  signalType: string;
  factOrInference: string;
  confidence?: string;
  evidenceText?: string;
  sourceRef?: string;
};

export type GenerateResult = {
  draftType: string;
  riskLevel: string;
  content: any;
  reasoning?: string;
};

export type LeadIntelligenceContext = {
  tenantId: string;
  leadId: string;
  triggerType: string;
  contextVersion: string;
  promptVersion: string;
};