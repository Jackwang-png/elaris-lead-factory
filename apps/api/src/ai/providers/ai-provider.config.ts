/**
 * P0-5B.1 — AI provider configuration (env-driven, all keys optional).
 *
 * Env contract (requirement 5 — provider/model configurable, no hardcoded
 * model in business code):
 *   AI_PROVIDER           default provider key. 'openai' unless DEEPSEEK_API_KEY
 *                         is set (then 'deepseek'). Explicit value wins.
 *   AI_DEFAULT_MODEL      per-call model override used when the business caller
 *                         passes no model (e.g. intent LLM path).
 *   AI_TIMEOUT_MS         default timeout for every AI call (default 60000).
 *                         Baseline had NO timeout (openai SDK default = 10 min);
 *                         a 60 s ceiling is introduced here because every AI
 *                         call must have a bounded timeout (requirement 10)
 *                         and is tunable per environment.
 *   AI_OPENAI_MODEL       'openai' provider default model (default gpt-3.5-turbo —
 *                         the pre-existing intent default, now configurable).
 *                         NOTE: on the current production endpoint
 *                         (OPENAI_BASE_URL → api.deepseek.com) gpt-3.5-turbo is
 *                         NOT verified — see report §6.
 *   AI_DEEPSEEK_MODEL     'deepseek' provider default model (default deepseek-chat,
 *                         matches production Bot.model default — verified).
 *   AI_EMBEDDING_MODEL    embedding model (default text-embedding-ada-002, the
 *                         pre-existing embedding default).
 *   AI_JSON_RESPONSE_FORMAT  'true'|'false' — send response_format json_object on
 *                         generateStructured (default true). If the endpoint
 *                         rejects it, the adapter retries once without the hint;
 *                         schema validation still gates the output.
 *   DEEPSEEK_API_KEY      'deepseek' provider key (falls back to OPENAI_API_KEY).
 *   DEEPSEEK_BASE_URL     'deepseek' provider base URL (default
 *                         https://api.deepseek.com/v1).
 *
 * Existing keys OPENAI_API_KEY / OPENAI_BASE_URL keep their exact meaning:
 * the 'openai' provider is constructed from them, so production behavior is
 * preserved (prod points OPENAI_BASE_URL at api.deepseek.com today).
 */

export interface OpenAICompatEndpointConfig {
  readonly name: 'openai' | 'deepseek';
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly defaultModel: string;
  readonly embeddingModel: string;
  readonly timeoutMs: number;
  readonly jsonResponseFormat: boolean;
}

/**
 * Value object used as the Nest DI token for AI configuration.
 * (Class, not interface — DI tokens must exist at runtime.)
 */
export class AIConfig {
  constructor(
    /** Provider key resolved by the registry as the default. */
    readonly defaultProviderName: string,
    /** Optional per-call model override (env AI_DEFAULT_MODEL). */
    readonly defaultModel: string | undefined,
    /** Default timeout for all AI calls. */
    readonly timeoutMs: number,
    readonly openai: OpenAICompatEndpointConfig,
    readonly deepseek: OpenAICompatEndpointConfig,
  ) {}
}

type Env = Record<string, string | undefined>;

function boolFromEnv(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return v.toLowerCase() === 'true';
}

function numFromEnv(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadAIConfig(env: Env): AIConfig {
  const timeoutMs = numFromEnv(env.AI_TIMEOUT_MS, 60000);
  const jsonResponseFormat = boolFromEnv(env.AI_JSON_RESPONSE_FORMAT, true);

  const defaultProviderName =
    env.AI_PROVIDER && env.AI_PROVIDER.trim() !== ''
      ? env.AI_PROVIDER.trim()
      : env.DEEPSEEK_API_KEY && env.DEEPSEEK_API_KEY.trim() !== ''
        ? 'deepseek'
        : 'openai';

  return new AIConfig(
    defaultProviderName,
    env.AI_DEFAULT_MODEL || undefined,
    timeoutMs,
    {
      name: 'openai',
      apiKey: env.OPENAI_API_KEY || undefined,
      baseURL: env.OPENAI_BASE_URL || undefined,
      defaultModel: env.AI_OPENAI_MODEL || 'gpt-3.5-turbo',
      embeddingModel: env.AI_EMBEDDING_MODEL || 'text-embedding-ada-002',
      timeoutMs,
      jsonResponseFormat,
    },
    {
      name: 'deepseek',
      apiKey: env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY || undefined,
      baseURL: env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      defaultModel: env.AI_DEEPSEEK_MODEL || 'deepseek-chat',
      embeddingModel: env.AI_EMBEDDING_MODEL || 'text-embedding-ada-002',
      timeoutMs,
      jsonResponseFormat,
    },
  );
}
