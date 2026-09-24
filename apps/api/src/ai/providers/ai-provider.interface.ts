/**
 * P0-5B.1 — AIProvider adapter boundary (frozen contract).
 *
 * This file is the contract between the AI domain (business services +
 * registry) and every AI provider adapter (OpenAI / DeepSeek / future).
 *
 * BOUNDARY RULE (mirrors payment-provider.interface.ts):
 *   - Adapters internally MAY use SDKs, HTTP clients and channel payloads.
 *   - Outside the boundary (AIProvider interface, AiProviderRegistry,
 *     business services, controllers) only the AI domain types are visible.
 *   - No OpenAI SDK type may appear outside the adapter directory.
 *   - `import OpenAI from 'openai'` / `new OpenAI(...)` is allowed ONLY
 *     inside provider adapters.
 *
 * TENANT RULE (requirement 14):
 *   - The provider layer is an infra layer. It MUST NOT query tenants,
 *     MUST NOT trust body/metadata tenantId, MUST NOT auto-select tenants.
 *   - tenantId in request.metadata is tracing/audit context only.
 *
 * PROMPT INJECTION RULE (requirement 13):
 *   - Adapters never promote messages/metadata into system instructions;
 *     untrusted content stays in the user message, exactly as the business
 *     prompt templates define them.
 */
import {
  AICapabilities,
  AIChatRequest,
  AIEmbedRequest,
  AIResult,
} from './ai-provider.types';

export interface AIProvider {
  /** Provider key, e.g. 'openai' | 'deepseek'. */
  readonly name: string;

  /**
   * Free-form chat completion. Returns the assistant text.
   * Throws AIError for transport-level failures (auth/rate/timeout/5xx).
   */
  chat(request: AIChatRequest): Promise<AIResult<string>>;

  /**
   * Structured output (requirement 6 — fail-closed):
   *   LLM → parse → schema validate → valid: success=true + data
   *                                → invalid: success=false + AI_INVALID_OUTPUT,
   *                                  data is ALWAYS undefined (no partial data).
   * Throws AIError for transport-level failures only.
   */
  generateStructured<T>(request: AIChatRequest): Promise<AIResult<T>>;

  /** Embeddings (existing knowledge-base usage; adapter-level only). */
  embed(request: AIEmbedRequest): Promise<AIResult<number[]>>;

  capabilities(): AICapabilities;
}
