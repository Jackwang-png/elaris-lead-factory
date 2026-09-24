/**
 * P0-5B.1 — AI Provider domain types.
 *
 * These types are the contract between business services and the AI
 * provider layer. Provider SDK types NEVER appear outside the adapter
 * boundary (mirrors src/payment/provider discipline).
 */

import { AIErrorCode } from './ai-provider.errors';

/* ------------------------------------------------------------------ */
/* Chat                                                                */
/* ------------------------------------------------------------------ */

export interface AIChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/**
 * Minimal JSON Schema subset supported by the internal validator
 * (ai-json-schema.validator.ts). Kept intentionally small: this is the
 * model-facing output contract and the validation contract at the same
 * time, so there is no dual-schema drift.
 */
export interface AIJSONSchema {
  readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  readonly properties?: Readonly<Record<string, AIJSONSchema>>;
  readonly required?: readonly string[];
  readonly items?: AIJSONSchema;
  readonly enum?: readonly unknown[];
  /** When false, object properties not listed in `properties` fail validation. */
  readonly additionalProperties?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface AIChatRequest {
  /** Provider-specific model id. When omitted the provider default is used. */
  readonly model?: string;
  readonly messages: readonly AIChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  /** Per-call timeout. When omitted the provider default (AI_TIMEOUT_MS) is used. */
  readonly timeoutMs?: number;
  /** Structured output contract. When present, output is parsed + schema-validated. */
  readonly responseSchema?: AIJSONSchema;
  /** Prompt version tag, e.g. 'lead-intent:v1' — carried through to AIResult. */
  readonly promptVersion?: string;
  /**
   * Opaque tracing/audit context. NOTE (requirement 14): metadata is
   * NEVER an authorization source — tenant identity must come from JWT /
   * trusted context only. The provider layer never reads tenants, never
   * queries the DB, and never promotes metadata into the prompt.
   */
  readonly metadata?: Readonly<{
    tenantId?: string;
    leadId?: string;
    conversationId?: string;
    requestId?: string;
    purpose?: string;
    [key: string]: unknown;
  }>;
}

export interface AIEmbedRequest {
  readonly model?: string;
  readonly input: string;
  readonly timeoutMs?: number;
  readonly metadata?: AIChatRequest['metadata'];
}

/* ------------------------------------------------------------------ */
/* Usage / Result                                                      */
/* ------------------------------------------------------------------ */

/**
 * Normalized token usage (requirement 9). Different providers return
 * different usage shapes — the adapter normalizes them so the business
 * layer only ever sees promptTokens / completionTokens / totalTokens.
 * When the provider returns no usage, `usageUnavailable` is true.
 * Zero is NEVER fabricated.
 */
export interface AIUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  /** True when the provider did not return usage data. */
  readonly usageUnavailable?: boolean;
}

export interface AIResultError {
  readonly code: AIErrorCode;
  readonly message: string;
}

export interface AIResult<T = string> {
  readonly success: boolean;
  /** Parsed/validated data. Undefined when success === false (fail-closed). */
  readonly data?: T;
  readonly provider: string;
  readonly model: string;
  readonly usage?: AIUsage;
  readonly promptVersion?: string;
  readonly requestId?: string;
  readonly error?: AIResultError;
}

export interface AICapabilities {
  readonly provider: string;
  /** Models known to be configured for this provider. */
  readonly models: readonly string[];
  /** Structured output (parse + schema validate) is supported by the adapter. */
  readonly supportsStructuredOutput: boolean;
  /** Embeddings endpoint is available on this adapter. */
  readonly supportsEmbeddings: boolean;
  /** Default timeout applied to every call when the request does not override it. */
  readonly defaultTimeoutMs: number;
}
