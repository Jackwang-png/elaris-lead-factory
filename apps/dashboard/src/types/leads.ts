export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  salesStatus?: string;
  company?: string;
  industry?: string;
  wechat?: string;
  platform?: string;
  intentScore?: number;
  intentLevel?: string;
  source?: string;
  interests?: string[];
  tags?: string[];
  preferences?: any;
  purchaseHistory?: any;
  buyingStage?: string;
  interestedProduct?: string;
  budget?: string;
  urgency?: string;
  highPurchaseIntent?: boolean;
  content?: string;
  remark?: string;
  followCount?: number;
  lastContactAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadIntelligence {
  id: string;
  tenantId: string;
  leadId: string;
  runId?: string;
  leadScore?: number;
  fitScore?: number;
  intentScore?: number;
  priority?: "P0" | "P1" | "P2" | "P3";
  observed?: Record<string, unknown>;
  inferred?: Record<string, unknown>;
  unknowns?: Record<string, unknown>;
  signals?: LeadSignal[];
  painPoints?: string;
  recommendedAction?: "draft_message" | "follow_up_question" | "wait" | "escalate";
  suggestedStrategy?: string;
  reasoningSummary?: string;
  modelMetadata?: Record<string, unknown>;
  createdAt: string;
}

export interface LeadSignal {
  id: string;
  tenantId: string;
  leadId: string;
  runId?: string;
  signalType: string;
  factOrInference: "OBSERVED" | "INFERRED" | "UNKNOWN";
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  evidenceText?: string;
  sourceRef?: string;
  observedAt?: string;
}

// Priority and Recommended Action Labels
const priorityLabels: Record<
  NonNullable<LeadIntelligence["priority"]>,
  { label: string; variant: "destructive" | "warning" | "info" | "secondary" }
> = {
  P0: { label: "P0", variant: "destructive" },
  P1: { label: "P1", variant: "warning" },
  P2: { label: "P2", variant: "info" },
  P3: { label: "P3", variant: "secondary" },
};

export const recommendedActionLabels = {
  draft_message: "建议生成跟进草稿",
  follow_up_question: "建议追问",
  wait: "建议等待",
  escalate: "建议升级人工",
};

export const getScoreColor = (score?: number) => {
  if (score === undefined || score === null) return "var(--text-tertiary)";
  if (score >= 80) return "var(--text-success)";
  if (score >= 50) return "var(--text-warning)";
  return "var(--text-danger)";
};

export default priorityLabels;