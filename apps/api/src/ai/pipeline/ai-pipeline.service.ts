import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntentService } from './intent.service';
import { CustomerMemoryService } from './customer-memory.service';
import { RecommendationService } from './recommendation.service';
import { LeadScoreService } from './lead-score.service';
import { SalesStrategyService } from './sales-strategy.service';
import { ResponseGenerationService } from './response-generation.service';
import { HandoffService } from '../../handoff/handoff.service';
import { AiQuotaService } from '../../quota/ai-quota.service';
import {
  QuotaExceededException,
  SubscriptionExpiredException,
} from '../../quota/quota.exceptions';
import { Conversation, Customer, Message } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger(AiPipelineService.name);

  constructor(
    private prisma: PrismaService,
    private intentService: IntentService,
    private customerMemoryService: CustomerMemoryService,
    private recommendationService: RecommendationService,
    private leadScoreService: LeadScoreService,
    private salesStrategyService: SalesStrategyService,
    private responseGenerationService: ResponseGenerationService,
    private handoffService: HandoffService,
    private aiQuotaService: AiQuotaService,
  ) {}

  async processMessage(
    tenantId: string,
    botId: string,
    conversationId: string,
    message: string,
    customerId?: string,
    channel?: string,
  ): Promise<{
    response: string;
    isLimited: boolean;
    intent?: {
      intent: string;
      confidence: number;
      keywords: string[];
    };
    leadScore?: number;
    leadLevel?: string;
    stage?: string;
    recommendations?: any[];
    error?: string;
    needsHuman?: boolean;
  }> {
    // ① 预检：订阅有效 + 理论仍有额度（不通过直接抛异常，HTTP 层返回 code）
    await this.aiQuotaService.assertCanRespond(tenantId);

    try {
      // P0-5A：会话必须属于当前 tenant（跨 tenant → 拒绝，不泄露存在性）
      let conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (conversation && conversation.tenantId !== tenantId) {
        throw new Error('Conversation not found');
      }

      // Record user message（tenantId 写入可信 tenant context）
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      await this.prisma.message.create({
        data: {
          id: uuidv4(),
          content: message,
          conversationId: conversation.id,
          role: customerId || 'user',
          tenantId,
        },
      });

      // Generate AI response
      const aiResponse = await this.generateSalesResponse(
        tenantId,
        botId,
        customerId,
        message,
        conversation,
        channel,
      );

      // ③ 原子消费一次成功 AI 回复（并发安全；超额抛 quota_exceeded）
      await this.aiQuotaService.consumeSuccessfulResponse(tenantId);

      // 转人工：AI 无法回答（unknown 意图 / 低置信度 / 兜底话术命中）
      let responseText = aiResponse.response;
      let needsHuman = false;
      if (aiResponse.needsHuman) {
        needsHuman = true;
        responseText = this.handoffService.handoffMessage;
        try {
          await this.handoffService.markHandoff(
            conversation.id,
            tenantId,
            this.handoffService.reasonOf(aiResponse.intent, aiResponse.isFallback),
          );
        } catch (e) {
          this.logger.warn(`标记转人工失败: ${e.message}`);
        }
        await this.handoffService.notifyAdmin({
          conversationId: conversation.id,
          tenantId,
          question: message,
        });
      }

      // Record AI response（tenantId 写入可信 tenant context）
      await this.prisma.message.create({
        data: {
          id: uuidv4(),
          content: responseText,
          conversationId: conversation.id,
          role: 'bot',
          tenantId,
        },
      });

      return {
        response: responseText,
        isLimited: false,
        intent: aiResponse.intent,
        leadScore: aiResponse.leadScore,
        leadLevel: aiResponse.leadLevel,
        stage: aiResponse.stage,
        recommendations: aiResponse.recommendations,
        needsHuman,
      };
    } catch (error) {
      // 额度 / 订阅类异常需向上透传，禁止被吞掉（保证 /me/quota 错误 code 可达客户端）
      if (
        error instanceof QuotaExceededException ||
        error instanceof SubscriptionExpiredException
      ) {
        throw error;
      }
      this.logger.error(`Error processing message: ${error.message}`);
      return {
        response: '抱歉，处理消息时出现错误，请稍后再试。',
        isLimited: false,
        error: error.message,
      };
    }
  }

  async generateSalesResponse(
    tenantId: string,
    botId: string,
    customerId: string | undefined,
    message: string,
    conversation?: any,
    channel?: string,
  ): Promise<{
    response: string;
    intent?: {
      intent: string;
      confidence: number;
      keywords: string[];
    };
    leadScore?: number;
    leadLevel?: string;
    stage?: string;
    recommendations?: any[];
    products?: any[];
    strategy?: any;
    /** 是否需要转人工（AI 无法回答） */
    needsHuman?: boolean;
    /** 是否命中兜底话术 */
    isFallback?: boolean;
  }> {
    // Analyze intent
    const intent = await this.intentService.classifyIntent(message);

    // Get customer memories
    const memories = customerId
      ? await this.customerMemoryService.getMemoriesByCustomer(customerId, botId)
      : [];

    // Get customer data
    const customer = customerId ? await this.prisma.customer.findUnique({
      where: { id: customerId },
    }) : null;

    // Determine sales strategy
    const strategy = this.salesStrategyService.determineStrategy(
      intent,
      customer,
      memories,
      channel,
    );

    // Get recommendations
    const recommendations = customerId
      ? await this.recommendationService.generateRecommendations(
          customerId,
          tenantId,
          botId,
          intent,
          memories,
        )
      : { products: [] };

    // Generate response
    const generated = this.responseGenerationService.generate(
      intent.intent,
      strategy,
      recommendations,
      conversation?.messages || [],
      channel,
    );

    // 转人工判定：unknown 意图 / 低置信度 / 兜底话术命中
    const needsHuman = this.handoffService.shouldHandoff(intent, generated.fallback);

    // Calculate lead score
    let leadScoreResult: any = null;
    if (customerId) {
      leadScoreResult = await this.leadScoreService.updateLeadScore(
        customerId,
        intent,
        tenantId,
      );
    }

    // Update conversation with lead score and stage
    const updateData: any = {
      lastMessage: message,
      updatedAt: new Date(),
    };

    if (leadScoreResult) {
      updateData.intentScore = leadScoreResult.score;
    }

    return {
      response: generated.text,
      intent,
      strategy,
      recommendations: recommendations.products,
      products: recommendations.products,
      needsHuman,
      isFallback: generated.fallback,
      ...(leadScoreResult && {
        leadScore: leadScoreResult.score,
        leadLevel: leadScoreResult.level,
        stage: strategy.nextAction,
      }),
    };
  }
}
