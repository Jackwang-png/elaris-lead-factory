/**
 * P0-5B.1 — AiProviderRegistry.
 *
 * Central registry managing all AI provider adapters (mirrors
 * PaymentProviderRegistry in src/payment/providers/payment-provider.registry.ts).
 *
 * Routing rules:
 *   - register() adds real adapters (openai / deepseek).
 *   - get(name) returns the registered adapter or UnknownAIProvider.
 *   - getDefault() returns the adapter resolved from AIConfig
 *     (env AI_PROVIDER → DEEPSEEK_API_KEY heuristic → 'openai'), or the
 *     Null fallback when the resolved name is not registered.
 *   - Business services MUST resolve providers through this registry —
 *     `new OpenAI(...)` is forbidden outside provider adapters.
 *
 * TENANT RULE (requirement 14): the registry is an infra component. It
 * holds NO tenant state, never queries the DB, and provider resolution is
 * driven exclusively by configuration — request metadata (tenantId etc.)
 * can never influence which provider/model is used.
 */
import { AIProvider } from './ai-provider.interface';
import { AIConfig } from './ai-provider.config';
import { NullAIProvider, UnknownAIProvider } from './null.provider';

export interface AiProviderRegistryOptions {
  readonly nullProvider?: AIProvider;
  readonly unknownProvider?: AIProvider;
}

export class AiProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();
  private readonly nullProvider: AIProvider;
  private readonly unknownProvider: AIProvider;

  constructor(
    private readonly config: AIConfig,
    options?: AiProviderRegistryOptions,
  ) {
    this.nullProvider = options?.nullProvider ?? new NullAIProvider();
    this.unknownProvider = options?.unknownProvider ?? new UnknownAIProvider();
  }

  /** Register a real provider adapter. Null/Unknown must NOT be registered. */
  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Resolve by key. Falls back to UnknownAIProvider when not registered. */
  get(name: string): AIProvider {
    return this.providers.get(name) ?? this.unknownProvider;
  }

  /** True when the name resolves to a real registered adapter. */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /** Registered adapter keys (real providers only). */
  getRegistered(): string[] {
    return [...this.providers.keys()];
  }

  /** Default provider key per AIConfig. */
  getDefaultName(): string {
    return this.config.defaultProviderName;
  }

  /**
   * Default adapter. Falls back to NullAIProvider when the configured
   * default name is not registered (never a silent fake).
   */
  getDefault(): AIProvider {
    const name = this.config.defaultProviderName;
    return this.providers.get(name) ?? this.nullProvider;
  }

  /** Expose the resolved configuration (models, timeouts…). */
  getConfig(): AIConfig {
    return this.config;
  }

  isUnknown(provider: AIProvider): boolean {
    return provider === this.unknownProvider;
  }

  isNull(provider: AIProvider): boolean {
    return provider === this.nullProvider;
  }
}
