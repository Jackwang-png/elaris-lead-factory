/**
 * P0-5B.1 — OpenAICompatProvider.
 *
 * The ONLY place in the codebase allowed to `import OpenAI from 'openai'`
 * and construct OpenAI SDK clients. Both the 'openai' and 'deepseek'
 * registry entries are instances of this adapter (DeepSeek exposes an
 * OpenAI-compatible protocol, so the same adapter covers both — verified
 * for the production endpoint per P0-5B audit: OPENAI_BASE_URL →
 * api.deepseek.com, bot.model default 'deepseek-chat').
 *
 * Responsibilities (adapter boundary):
 *   - timeouts on every call (requirement 10)
 *   - SDK error → AIErrorCode normalization (requirement 11)
 *   - usage normalization prompt_tokens/completion_tokens/total_tokens
 *     (requirement 9); usageUnavailable=true when the provider returns none
 *   - structured output: LLM → parse → schema validate → valid: success /
 *     invalid: success=false + AI_INVALID_OUTPUT, data ALWAYS undefined
 *     (requirement 6, fail-closed; no partial data, no silent fallback)
 *   - response_format json_object hint, retried once without the hint when
 *     the endpoint rejects it (validation still gates the output)
 *
 * The adapter has NO DB access, NO tenant knowledge and never promotes
 * request metadata into the prompt (requirements 13/14).
 */
import OpenAI from 'openai';
import { AIProvider } from './ai-provider.interface';
import {
  AIError,
  AIErrorCode,
} from './ai-provider.errors';
import {
  AICapabilities,
  AIChatRequest,
  AIEmbedRequest,
  AIResult,
  AIUsage,
} from './ai-provider.types';
import {
  tryParseJson,
  validateJsonAgainstSchema,
} from './ai-json-schema.validator';
import { OpenAICompatEndpointConfig } from './ai-provider.config';

/** Injectable client seam for tests (no network / no real credentials). */
export interface OpenAICompletionLike {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

export interface OpenAIEmbeddingLike {
  data?: Array<{ embedding?: number[] }>;
  usage?: { prompt_tokens?: number } | null;
}

export type OpenAIClientLike = {
  chat: {
    completions: {
      create(
        body: Record<string, unknown>,
        options?: { timeout?: number },
      ): Promise<OpenAICompletionLike>;
    };
  };
  embeddings: {
    create(
      body: Record<string, unknown>,
      options?: { timeout?: number },
    ): Promise<OpenAIEmbeddingLike>;
  };
};

export interface OpenAICompatProviderConfig extends OpenAICompatEndpointConfig {
  /** Override the SDK client (unit tests). Defaults to a real SDK client. */
  readonly client?: OpenAIClientLike;
}

export class OpenAICompatProvider implements AIProvider {
  readonly name: string;
  private readonly client: OpenAIClientLike | undefined;
  private readonly config: OpenAICompatProviderConfig;

  constructor(config: OpenAICompatProviderConfig) {
    this.name = config.name;
    this.config = config;
    if (config.client) {
      this.client = config.client;
    } else if (config.apiKey) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        timeout: config.timeoutMs,
        // SDK default retries (2) on 429/5xx are kept — safe for chat.
      }) as unknown as OpenAIClientLike;
    } else {
      // Graceful degradation: boot succeeds, calls fail explicitly with
      // AI_CONFIGURATION_ERROR instead of crashing module bootstrap.
      this.client = undefined;
    }
  }

  capabilities(): AICapabilities {
    return {
      provider: this.name,
      models: [this.config.defaultModel, this.config.embeddingModel],
      supportsStructuredOutput: true,
      supportsEmbeddings: true,
      defaultTimeoutMs: this.config.timeoutMs,
    };
  }

  /* ---------------------------------------------------------------- */
  /* chat                                                              */
  /* ---------------------------------------------------------------- */

  async chat(request: AIChatRequest): Promise<AIResult<string>> {
    const client = this.requireClient('chat');
    const model = request.model || this.config.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: [...request.messages],
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;

    let response: OpenAICompletionLike;
    try {
      response = await client.chat.completions.create(body, {
        timeout: request.timeoutMs || this.config.timeoutMs,
      });
    } catch (err) {
      throw this.mapError(err);
    }

    const content = response.choices?.[0]?.message?.content ?? '';
    return this.buildResult({
      data: content,
      provider: this.name,
      model: response.model || model,
      usage: normalizeUsage(response.usage),
      promptVersion: request.promptVersion,
      requestId: request.metadata?.requestId,
    });
  }

  /* ---------------------------------------------------------------- */
  /* generateStructured (fail-closed)                                  */
  /* ---------------------------------------------------------------- */

  async generateStructured<T>(request: AIChatRequest): Promise<AIResult<T>> {
    const client = this.requireClient('generateStructured');
    const model = request.model || this.config.defaultModel;

    if (!request.responseSchema) {
      throw AIError.configurationError(
        this.name,
        'generateStructured',
        'responseSchema is required',
      );
    }

    const body: Record<string, unknown> = {
      model,
      messages: [...request.messages],
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (this.config.jsonResponseFormat) {
      body.response_format = { type: 'json_object' };
    }

    let response: OpenAICompletionLike;
    try {
      response = await client.chat.completions.create(body, {
        timeout: request.timeoutMs || this.config.timeoutMs,
      });
    } catch (err) {
      // Endpoints that do not support response_format (some OpenAI-compatible
      // servers) reject with 400. Retry once WITHOUT the hint — the schema
      // validation below still gates the output (no unverified acceptance).
      if (this.config.jsonResponseFormat && isBadRequest(err)) {
        delete body.response_format;
        try {
          response = await client.chat.completions.create(body, {
            timeout: request.timeoutMs || this.config.timeoutMs,
          });
        } catch (err2) {
          throw this.mapError(err2);
        }
      } else {
        throw this.mapError(err);
      }
    }

    const content = response.choices?.[0]?.message?.content ?? '';
    const parsed = tryParseJson(content);

    if (parsed === undefined) {
      return this.buildResult<T>({
        success: false,
        provider: this.name,
        model: response.model || model,
        usage: normalizeUsage(response.usage),
        promptVersion: request.promptVersion,
        requestId: request.metadata?.requestId,
        error: {
          code: AIErrorCode.AI_INVALID_OUTPUT,
          message: `output is not valid JSON (provider=${this.name}, model=${model})`,
        },
      });
    }

    const errors = validateJsonAgainstSchema(parsed, request.responseSchema);
    if (errors.length > 0) {
      return this.buildResult<T>({
        success: false,
        provider: this.name,
        model: response.model || model,
        usage: normalizeUsage(response.usage),
        promptVersion: request.promptVersion,
        requestId: request.metadata?.requestId,
        error: {
          code: AIErrorCode.AI_INVALID_OUTPUT,
          message: `schema validation failed: ${errors.slice(0, 5).join('; ')}`,
        },
      });
    }

    return this.buildResult<T>({
      success: true,
      data: parsed as T,
      provider: this.name,
      model: response.model || model,
      usage: normalizeUsage(response.usage),
      promptVersion: request.promptVersion,
      requestId: request.metadata?.requestId,
    });
  }

  /* ---------------------------------------------------------------- */
  /* embed                                                             */
  /* ---------------------------------------------------------------- */

  async embed(request: AIEmbedRequest): Promise<AIResult<number[]>> {
    const client = this.requireClient('embed');
    const model = request.model || this.config.embeddingModel;

    let response: OpenAIEmbeddingLike;
    try {
      response = await client.embeddings.create(
        { model, input: request.input },
        { timeout: request.timeoutMs || this.config.timeoutMs },
      );
    } catch (err) {
      throw this.mapError(err);
    }

    const embedding = response.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new AIError(
        `[${this.name}] embed(): provider returned no embedding`,
        { code: AIErrorCode.AI_PROVIDER_ERROR, provider: this.name },
      );
    }

    return this.buildResult({
      data: embedding,
      provider: this.name,
      model,
      usage: normalizeUsage(response.usage),
      requestId: request.metadata?.requestId,
    });
  }

  /* ---------------------------------------------------------------- */
  /* internals                                                         */
  /* ---------------------------------------------------------------- */

  private requireClient(method: string): OpenAIClientLike {
    if (!this.client) {
      throw AIError.configurationError(
        this.name,
        method,
        'no API key configured (OPENAI_API_KEY / DEEPSEEK_API_KEY)',
      );
    }
    return this.client;
  }

  private mapError(err: unknown): AIError {
    if (err instanceof AIError) return err;
    const e = err as {
      status?: number;
      code?: string | null;
      name?: string;
      message?: string;
    };

    const message = e?.message || String(err);
    const isTimeout =
      e?.name === 'AbortError' ||
      e?.name === 'APIConnectionTimeoutError' ||
      e?.code === 'ETIMEDOUT' ||
      e?.code === 'ECONNABORTED' ||
      e?.status === 408 ||
      /timeout|timed out/i.test(message);

    if (isTimeout) {
      return new AIError(
        `[${this.name}] AI request timed out after ${this.config.timeoutMs}ms`,
        { code: AIErrorCode.AI_TIMEOUT, provider: this.name, retryable: true, cause: err },
      );
    }

    const status = e?.status;
    if (status === 401 || status === 403) {
      return new AIError(
        `[${this.name}] authentication/authorization failed (HTTP ${status})`,
        { code: AIErrorCode.AI_AUTH_ERROR, provider: this.name, retryable: false, cause: err },
      );
    }
    if (status === 429) {
      return new AIError(
        `[${this.name}] rate limited (HTTP 429)`,
        { code: AIErrorCode.AI_RATE_LIMITED, provider: this.name, retryable: true, cause: err },
      );
    }
    if (status !== undefined && status >= 500) {
      return new AIError(
        `[${this.name}] provider error (HTTP ${status})`,
        { code: AIErrorCode.AI_PROVIDER_ERROR, provider: this.name, retryable: true, cause: err },
      );
    }
    if (status === 400 && /model|not exist|unknown/i.test(message)) {
      return new AIError(
        `[${this.name}] model unavailable: ${message.slice(0, 200)}`,
        { code: AIErrorCode.AI_CONFIGURATION_ERROR, provider: this.name, retryable: false, cause: err },
      );
    }
    if (status === 400) {
      return new AIError(
        `[${this.name}] bad request (HTTP 400): ${message.slice(0, 200)}`,
        { code: AIErrorCode.AI_PROVIDER_ERROR, provider: this.name, retryable: false, cause: err },
      );
    }
    return new AIError(
      `[${this.name}] provider error: ${message.slice(0, 200)}`,
      { code: AIErrorCode.AI_PROVIDER_ERROR, provider: this.name, retryable: true, cause: err },
    );
  }

  private buildResult<T>(args: {
    success?: boolean;
    data?: T;
    provider: string;
    model: string;
    usage?: AIUsage;
    promptVersion?: string;
    requestId?: string;
    error?: { code: AIErrorCode; message: string };
  }): AIResult<T> {
    return {
      success: args.success ?? true,
      ...(args.data !== undefined ? { data: args.data } : {}),
      provider: args.provider,
      model: args.model,
      ...(args.usage ? { usage: args.usage } : {}),
      ...(args.promptVersion ? { promptVersion: args.promptVersion } : {}),
      ...(args.requestId ? { requestId: args.requestId } : {}),
      ...(args.error ? { error: args.error } : {}),
    };
  }
}

/** Usage normalization — provider-specific shapes → AIUsage (no fake zeros). */
export function normalizeUsage(
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null,
): AIUsage | undefined {
  if (!usage) {
    return { usageUnavailable: true };
  }
  const hasAny =
    usage.prompt_tokens !== undefined ||
    usage.completion_tokens !== undefined ||
    usage.total_tokens !== undefined;
  if (!hasAny) {
    return { usageUnavailable: true };
  }
  // AIUsage is readonly — build the object literally instead of mutating.
  return {
    ...(usage.prompt_tokens !== undefined ? { promptTokens: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens !== undefined ? { completionTokens: usage.completion_tokens } : {}),
    ...(usage.total_tokens !== undefined ? { totalTokens: usage.total_tokens } : {}),
  };
}

function isBadRequest(err: unknown): boolean {
  const e = err as { status?: number };
  return e?.status === 400;
}
