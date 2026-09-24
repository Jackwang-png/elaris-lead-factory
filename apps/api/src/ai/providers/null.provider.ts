/**
 * P0-5B.1 — NullAIProvider / UnknownAIProvider fallbacks.
 *
 * Mirrors payment null.provider / unknown.provider discipline: these
 * fallbacks NEVER join the registered provider set and their operations
 * always fail explicitly with AI_PROVIDER_NOT_AVAILABLE — no silent
 * degradation, no fake data.
 */
import { AIProvider } from './ai-provider.interface';
import { AIError } from './ai-provider.errors';
import {
  AICapabilities,
  AIChatRequest,
  AIEmbedRequest,
  AIResult,
} from './ai-provider.types';

class UnavailableAIProvider implements AIProvider {
  constructor(readonly name: string) {}

  private fail(method: string): never {
    throw AIError.providerNotAvailable(
      this.name,
      method,
      `${this.name} provider is not configured`,
    );
  }

  async chat(_request: AIChatRequest): Promise<AIResult<string>> {
    this.fail('chat');
  }

  async generateStructured<T>(_request: AIChatRequest): Promise<AIResult<T>> {
    this.fail('generateStructured');
  }

  async embed(_request: AIEmbedRequest): Promise<AIResult<number[]>> {
    this.fail('embed');
  }

  capabilities(): AICapabilities {
    return {
      provider: this.name,
      models: [],
      supportsStructuredOutput: false,
      supportsEmbeddings: false,
      defaultTimeoutMs: 0,
    };
  }
}

/** Returned by the registry when no provider is configured/available. */
export class NullAIProvider extends UnavailableAIProvider {
  constructor() {
    super('null');
  }
}

/** Returned by the registry when the requested provider name is not registered. */
export class UnknownAIProvider extends UnavailableAIProvider {
  constructor() {
    super('unknown');
  }
}
