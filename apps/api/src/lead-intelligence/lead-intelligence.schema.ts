import { Injectable } from '@nestjs/common';
import { AIJSONSchema } from '../ai/providers/ai-provider.types';
import { LEAD_INTELLIGENCE_CONSTANTS as C } from './lead-intelligence.constants';
import { LeadIntelligenceError } from './lead-intelligence.errors';

/**
 * P0-5B.3 — Structured output contract (AIJSONSchema) + post-validation.
 *
 * The AIJSONSchema below is passed to AIProvider.generateStructured:
 * fail-closed — invalid JSON / schema violation → success=false, data
 * never reaches the DB. validateAnalyzeResult() is the second gate
 * (value ranges + normalization to table-shaped fields).
 */

/** AI output contract for lead analysis (enforced by the provider layer). */
export const LEAD_ANALYSIS_OUTPUT_SCHEMA: AIJSONSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fitScore',
    'intentScore',
    'priority',
    'recommendedAction',
    'reasoningSummary',
    'unknowns',
    'signals',
  ],
  properties: {
    fitScore: { type: 'integer', minimum: 0, maximum: 100 },
    intentScore: { type: 'integer', minimum: 0, maximum: 100 },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
    recommendedAction: {
      type: 'string',
      enum: ['draft_message', 'follow_up_question', 'wait', 'escalate'],
    },
    reasoningSummary: { type: 'string', minLength: 1 },
    unknowns: { type: 'object' },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'factOrInference'],
        properties: {
          type: { type: 'string', minLength: 1 },
          factOrInference: {
            type: 'string',
            enum: ['OBSERVED', 'INFERRED', 'UNKNOWN'],
          },
          confidence: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          evidence: { type: 'string' },
          sourceType: { type: 'string' },
          sourceId: { type: 'string' },
        },
      },
    },
  },
};

/** AI output contract for draft generation (contract only, no sending). */
export const LEAD_DRAFT_OUTPUT_SCHEMA: AIJSONSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['draftType', 'riskLevel', 'content', 'reasoning'],
  properties: {
    draftType: {
      type: 'string',
      enum: [
        C.DRAFT_TYPES.FIRST_CONTACT,
        C.DRAFT_TYPES.FOLLOW_UP,
        C.DRAFT_TYPES.CLARIFICATION,
        C.DRAFT_TYPES.RE_ENGAGEMENT,
      ],
    },
    riskLevel: {
      type: 'string',
      enum: [C.RISK_LEVELS.LOW, C.RISK_LEVELS.MEDIUM, C.RISK_LEVELS.HIGH],
    },
    content: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'body'],
      properties: {
        subject: { type: 'string', minLength: 1 },
        body: { type: 'string', minLength: 1 },
        asks: { type: 'array', items: { type: 'string' } },
      },
    },
    reasoning: { type: 'string' },
  },
};

const VALID_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const VALID_ACTIONS = ['draft_message', 'follow_up_question', 'wait', 'escalate'];

@Injectable()
export class LeadIntelligenceSchema {
  /** Provider-level structured output contract (fail-closed). */
  readonly analysisOutputSchema: AIJSONSchema = LEAD_ANALYSIS_OUTPUT_SCHEMA;
  readonly draftOutputSchema: AIJSONSchema = LEAD_DRAFT_OUTPUT_SCHEMA;
  /**
   * Post-validate + normalize an analyze payload (second gate after the
   * provider-level schema). Accepts both the P0-5B.3 AI contract
   * (type/evidence/sourceType/sourceId) and the legacy P0-5B.2 shape
   * (signalType/evidenceText/sourceRef). Throws on any violation.
   */
  validateAnalyzeResult(data: any): any {
    if (!data) {
      throw new LeadIntelligenceError('Analyze result is empty');
    }

    const result: any = {};

    // Scores
    for (const [key, label] of [
      ['leadScore', 'leadScore'],
      ['fitScore', 'fitScore'],
      ['intentScore', 'intentScore'],
    ] as const) {
      if (data[key] !== undefined) {
        if (typeof data[key] !== 'number' || data[key] < 0 || data[key] > 100) {
          throw new LeadIntelligenceError(`Invalid ${label}`);
        }
        result[key] = data[key];
      }
    }

    // priority
    if (data.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(data.priority)) {
        throw new LeadIntelligenceError('Invalid priority');
      }
      result.priority = data.priority;
    }

    // recommendedAction
    if (data.recommendedAction !== undefined) {
      if (!VALID_ACTIONS.includes(data.recommendedAction)) {
        throw new LeadIntelligenceError('Invalid recommendedAction');
      }
      result.recommendedAction = data.recommendedAction;
    }

    // reasoningSummary (P0-5B.3)
    if (data.reasoningSummary !== undefined) {
      if (typeof data.reasoningSummary !== 'string' || data.reasoningSummary.trim() === '') {
        throw new LeadIntelligenceError('Invalid reasoningSummary');
      }
      result.reasoningSummary = data.reasoningSummary;
    }

    // object fields
    ['observed', 'inferred', 'unknowns', 'painPoints', 'suggestedStrategy', 'modelMetadata'].forEach(
      (field) => {
        if (data[field] !== undefined) {
          if (typeof data[field] !== 'object' || data[field] === null || Array.isArray(data[field])) {
            throw new LeadIntelligenceError(`Invalid ${field}`);
          }
          result[field] = data[field];
        }
      },
    );

    // signals (normalized to table shape)
    if (data.signals !== undefined) {
      if (!Array.isArray(data.signals)) {
        throw new LeadIntelligenceError('Invalid signals');
      }
      result.signals = data.signals.map((signal: any, i: number) => {
        if (typeof signal !== 'object' || signal === null) {
          throw new LeadIntelligenceError(`Invalid signal at index ${i}`);
        }
        // P0-5B.3 contract: type / evidence / sourceType / sourceId
        const signalType = signal.type ?? signal.signalType;
        const evidenceText = signal.evidence ?? signal.evidenceText;
        const sourceRef =
          signal.sourceRef ??
          (signal.sourceType !== undefined && signal.sourceId !== undefined
            ? `${signal.sourceType}:${signal.sourceId}`
            : undefined);

        if (typeof signalType !== 'string' || signalType.trim() === '') {
          throw new LeadIntelligenceError(`Invalid signal type at index ${i}`);
        }
        if (
          !Object.values(C.FACT_OR_INFERENCE).includes(signal.factOrInference)
        ) {
          throw new LeadIntelligenceError(`Invalid factOrInference at index ${i}`);
        }
        const confidence = signal.confidence || C.CONFIDENCE.MEDIUM;
        if (!Object.values(C.CONFIDENCE).includes(confidence)) {
          throw new LeadIntelligenceError(`Invalid confidence at index ${i}`);
        }
        if (evidenceText !== undefined && typeof evidenceText !== 'string') {
          throw new LeadIntelligenceError(`Invalid evidence at index ${i}`);
        }
        if (sourceRef !== undefined && typeof sourceRef !== 'string') {
          throw new LeadIntelligenceError(`Invalid sourceRef at index ${i}`);
        }
        return {
          signalType,
          factOrInference: signal.factOrInference,
          confidence,
          ...(evidenceText !== undefined ? { evidenceText } : {}),
          ...(sourceRef !== undefined ? { sourceRef } : {}),
        };
      });
    }

    return result;
  }

  validateGenerateResult(data: any): any {
    if (!data) {
      throw new LeadIntelligenceError('Generate result is empty');
    }

    const result: any = {};

    if (!Object.values(C.DRAFT_TYPES).includes(data.draftType)) {
      throw new LeadIntelligenceError('Invalid draftType');
    }
    result.draftType = data.draftType;

    if (!Object.values(C.RISK_LEVELS).includes(data.riskLevel)) {
      throw new LeadIntelligenceError('Invalid riskLevel');
    }
    result.riskLevel = data.riskLevel;

    if (
      typeof data.content !== 'object' ||
      data.content === null ||
      typeof data.content.subject !== 'string' ||
      typeof data.content.body !== 'string'
    ) {
      throw new LeadIntelligenceError('Invalid content');
    }
    result.content = data.content;

    if (data.reasoning !== undefined) {
      if (typeof data.reasoning !== 'string') {
        throw new LeadIntelligenceError('Invalid reasoning');
      }
      result.reasoning = data.reasoning;
    }

    return result;
  }
}
