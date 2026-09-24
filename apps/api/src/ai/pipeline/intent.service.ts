import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';
import { AIProvider } from '../providers/ai-provider.interface';
import { AIError } from '../providers/ai-provider.errors';
import { AIJSONSchema } from '../providers/ai-provider.types';

export interface IntentResult {
  intent: string;
  confidence: number;
  keywords: string[];
  score?: number;
  level?: string;
}

/**
 * P0-5B.1 migration: intent classification now resolves its LLM path through
 * AiProviderRegistry (no bare OpenAI client, no hardcoded model in business
 * code). Keyword analysis is untouched.
 *
 * LLM path (only when keyword confidence ≤ 0.5):
 *   provider.generateStructured() → parse + schema validate (fail-closed).
 *   On invalid output / provider error the service falls back to the
 *   deterministic keyword result — this fallback is VERIFIED data (rule-based),
 *   never partial/unverified LLM data (see report §7/§9).
 */
@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  private readonly patterns = [
    {
      intent: 'product_inquiry',
      keywords: ['产品', '介绍', '功能', '特点', '规格', '参数', '型号'],
    },
    {
      intent: 'price_inquiry',
      keywords: ['价格', '多少钱', '费用', '报价', '收费', '贵吗', '便宜'],
    },
    {
      intent: 'promotion_inquiry',
      keywords: ['优惠', '折扣', '促销', '活动', '特价', '打折'],
    },
    {
      intent: 'purchase_intent',
      keywords: ['购买', '下单', '买', '订购', '付款', '支付', '要', '想要'],
    },
    {
      intent: 'after_sales',
      keywords: ['售后', '维修', '退换', '保修', '服务', '问题', '坏了'],
    },
    {
      intent: 'complaint',
      keywords: ['投诉', '不满', '差评', '问题', '糟糕', '生气', '不高兴'],
    },
    {
      intent: 'comparison',
      keywords: ['比较', '对比', '区别', '哪个好', '选择', '推荐'],
    },
    {
      intent: 'hesitation',
      keywords: ['犹豫', '考虑', '想想', '再看看', '考虑一下', '不确定'],
    },
    {
      intent: 'greeting',
      keywords: ['你好', '您好', 'hello', 'hi', '在吗', '在不在'],
    },
    {
      intent: 'thanks',
      keywords: ['谢谢', '感谢', '多谢', 'thank', 'thanks'],
    },
    {
      intent: 'goodbye',
      keywords: ['再见', '拜拜', 'bye', '下次再聊', '先这样'],
    },
  ];

  constructor(
    private prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
  ) {}

  analyze(message: string): IntentResult {
    const text = message.toLowerCase();

    let bestIntent = 'unknown';
    let bestConfidence = 0;
    let bestKeywords: string[] = [];

    for (const pattern of this.patterns) {
      const matchedKeywords = pattern.keywords.filter(k =>
        text.includes(k.toLowerCase())
      );

      if (matchedKeywords.length > 0) {
        const confidence = matchedKeywords.length / pattern.keywords.length;

        if (confidence > bestConfidence) {
          bestIntent = pattern.intent;
          bestConfidence = confidence;
          bestKeywords = matchedKeywords;
        }
      }
    }

    return {
      intent: bestIntent,
      confidence: bestConfidence,
      keywords: bestKeywords,
    };
  }

  async classifyIntent(message: string, model?: string): Promise<IntentResult> {
    const result = this.analyze(message);

    // If we have a good match from keyword analysis, use that
    if (result.confidence > 0.5) {
      return result;
    }

    // Otherwise, use LLM for more complex analysis (through the provider
    // registry — provider/model are configuration-driven, not hardcoded).
    const provider: AIProvider = this.registry.getDefault();
    try {
      const llmResult = await provider.generateStructured<{
        intent: string;
        confidence: number;
        keywords: string[];
      }>({
        model: model || this.registry.getConfig().defaultModel || undefined,
        messages: [
          {
            role: 'system',
            content: `你是一个智能销售助手，需要分析客户消息的意图。请根据以下消息内容，判断客户的意图，并返回JSON格式的结果，包含intent(意图类型)、confidence(置信度0-1)、keywords(关键词数组)三个字段。可选的意图类型包括：${this.patterns.map(p => p.intent).join(', ')}、unknown。`,
          },
          {
            role: 'user',
            content: `请分析以下消息的意图：${message}`,
          },
        ],
        temperature: 0.3,
        responseSchema: this.buildIntentSchema(),
        promptVersion: 'lead-intent:v1',
        metadata: {
          purpose: 'intent_classification',
          requestId: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        },
      });

      if (!llmResult.success || !llmResult.data) {
        // Fail-closed: never use partial/unverified LLM data. The keyword
        // result below is deterministic (verified), so it is a safe fallback.
        this.logger.warn(
          `Intent LLM output invalid (${llmResult.error?.code}): ${llmResult.error?.message} — using deterministic keyword result`,
        );
        return result;
      }

      return {
        intent: llmResult.data.intent || result.intent,
        confidence:
          typeof llmResult.data.confidence === 'number'
            ? llmResult.data.confidence
            : 0.7,
        keywords:
          Array.isArray(llmResult.data.keywords) && llmResult.data.keywords.length > 0
            ? llmResult.data.keywords
            : result.keywords,
      };
    } catch (error) {
      if (error instanceof AIError) {
        this.logger.warn(
          `Intent LLM provider error (${error.code}): ${error.message} — using deterministic keyword result`,
        );
      } else {
        this.logger.error(
          `Intent LLM unexpected error: ${(error as Error)?.message || String(error)}`,
        );
      }
      return result;
    }
  }

  async detectBuyingIntent(message: string, model?: string): Promise<boolean> {
    const result = await this.classifyIntent(message, model);
    return ['purchase_intent', 'price_inquiry'].includes(result.intent);
  }

  async detectPurchaseIntention(message: string, model?: string): Promise<boolean> {
    return this.detectBuyingIntent(message, model);
  }

  async detectBuyingIntention(message: string, model?: string): Promise<boolean> {
    const result = await this.classifyIntent(message, model);
    return ['purchase_intent', 'price_inquiry'].includes(result.intent);
  }

  async detectComplaint(message: string, model?: string): Promise<boolean> {
    const result = await this.classifyIntent(message, model);
    return result.intent === 'complaint';
  }

  async detectAfterSalesSupport(message: string, model?: string): Promise<boolean> {
    const result = await this.classifyIntent(message, model);
    return result.intent === 'after_sales';
  }

  async detectComparisonShopping(message: string, model?: string): Promise<boolean> {
    const result = await this.classifyIntent(message, model);
    return result.intent === 'comparison';
  }

  async detectUnclear(message: string, model?: string): Promise<boolean> {
    const result = await this.classifyIntent(message, model);
    return result.intent === 'unknown' || result.confidence < 0.3;
  }

  /** Structured output contract for the intent LLM path (fail-closed). */
  private buildIntentSchema(): AIJSONSchema {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['intent', 'confidence', 'keywords'],
      properties: {
        intent: {
          type: 'string',
          enum: [...this.patterns.map(p => p.intent), 'unknown'],
        },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        keywords: { type: 'array', items: { type: 'string' } },
      },
    };
  }
}
