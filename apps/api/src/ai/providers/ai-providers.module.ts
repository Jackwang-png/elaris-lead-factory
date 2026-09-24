/**
 * P0-5B.1 — AiProvidersModule.
 *
 * Nest DI wiring for AI provider adapters + registry (mirrors
 * PaymentProvidersModule).
 *
 * Registered adapters:
 *   - 'openai'   built from OPENAI_API_KEY / OPENAI_BASE_URL (preserves the
 *                exact pre-P0-5B.1 endpoint behavior — production points
 *                OPENAI_BASE_URL at api.deepseek.com today)
 *   - 'deepseek' built from DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL (falls back
 *                to OPENAI_API_KEY when DEEPSEEK_API_KEY is unset)
 *
 * Business modules import AiProvidersModule and inject AiProviderRegistry —
 * they must never construct `new OpenAI(...)`.
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AIConfig, loadAIConfig } from './ai-provider.config';
import { AiProviderRegistry } from './ai-provider.registry';
import { NullAIProvider, UnknownAIProvider } from './null.provider';
import { OpenAICompatProvider } from './openai-compat.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: AIConfig,
      useFactory: (config: ConfigService) =>
        loadAIConfig({
          AI_PROVIDER: config.get<string>('AI_PROVIDER'),
          AI_DEFAULT_MODEL: config.get<string>('AI_DEFAULT_MODEL'),
          AI_TIMEOUT_MS: config.get<string>('AI_TIMEOUT_MS'),
          AI_OPENAI_MODEL: config.get<string>('AI_OPENAI_MODEL'),
          AI_DEEPSEEK_MODEL: config.get<string>('AI_DEEPSEEK_MODEL'),
          AI_EMBEDDING_MODEL: config.get<string>('AI_EMBEDDING_MODEL'),
          AI_JSON_RESPONSE_FORMAT: config.get<string>('AI_JSON_RESPONSE_FORMAT'),
          OPENAI_API_KEY: config.get<string>('OPENAI_API_KEY'),
          OPENAI_BASE_URL: config.get<string>('OPENAI_BASE_URL'),
          DEEPSEEK_API_KEY: config.get<string>('DEEPSEEK_API_KEY'),
          DEEPSEEK_BASE_URL: config.get<string>('DEEPSEEK_BASE_URL'),
        }),
      inject: [ConfigService],
    },
    {
      provide: 'AI_PROVIDER_OPENAI',
      useFactory: (aiConfig: AIConfig) =>
        new OpenAICompatProvider(aiConfig.openai),
      inject: [AIConfig],
    },
    {
      provide: 'AI_PROVIDER_DEEPSEEK',
      useFactory: (aiConfig: AIConfig) =>
        new OpenAICompatProvider(aiConfig.deepseek),
      inject: [AIConfig],
    },
    {
      provide: NullAIProvider,
      useFactory: () => new NullAIProvider(),
    },
    {
      provide: UnknownAIProvider,
      useFactory: () => new UnknownAIProvider(),
    },
    {
      provide: AiProviderRegistry,
      useFactory: (
        aiConfig: AIConfig,
        openai: OpenAICompatProvider,
        deepseek: OpenAICompatProvider,
        nullProvider: NullAIProvider,
        unknownProvider: UnknownAIProvider,
      ) => {
        const registry = new AiProviderRegistry(aiConfig, {
          nullProvider,
          unknownProvider,
        });
        // Real adapters only — Null/Unknown stay as fallbacks.
        registry.register(openai);
        registry.register(deepseek);
        return registry;
      },
      inject: [
        AIConfig,
        'AI_PROVIDER_OPENAI',
        'AI_PROVIDER_DEEPSEEK',
        NullAIProvider,
        UnknownAIProvider,
      ],
    },
  ],
  exports: [AiProviderRegistry, AIConfig],
})
export class AiProvidersModule {}
