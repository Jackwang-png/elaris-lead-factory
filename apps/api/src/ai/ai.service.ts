import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IntentService } from './pipeline/intent.service';
import { CustomerMemoryService } from './pipeline/customer-memory.service';
import { KnowledgeRetrievalService } from './pipeline/knowledge-retrieval.service';
import { RecommendationService } from './pipeline/recommendation.service';
import { LeadScoreService } from './pipeline/lead-score.service';
import { v4 as uuidv4 } from 'uuid';
import { AiPipelineService } from './pipeline/ai-pipeline.service';
import { SalesStrategyService } from './pipeline/sales-strategy.service';
import { Conversation, Customer, Message } from '@prisma/client';
import { QuotaExceededException, SubscriptionExpiredException } from '../quota/quota.exceptions';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private prisma: PrismaService,
    private intentService: IntentService,
    private customerMemoryService: CustomerMemoryService,
    private knowledgeRetrievalService: KnowledgeRetrievalService,
    private recommendationService: RecommendationService,
    private leadScoreService: LeadScoreService,
    private aiPipelineService: AiPipelineService,
    private salesStrategyService: SalesStrategyService,
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
  }> {
    try {
      // P0-5A：会话必须属于当前 tenant（跨 tenant → NotFound，不泄露存在性）
      let conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (conversation && conversation.tenantId !== tenantId) {
        throw new NotFoundException('Conversation not found');
      }

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            id: conversationId,
            botId: botId || undefined,
            tenantId,
            visitor: customerId || conversationId,
          },
        });
      }

      // Record user message（tenantId 写入可信 tenant context）
      await this.prisma.message.create({
        data: {
          id: uuidv4(),
          content: message,
          conversationId: conversation.id,
          role: customerId || conversation.visitor,
          tenantId,
        },
      });

      // Process through AI pipeline
      const aiResult = await this.aiPipelineService.processMessage(
        tenantId,
        botId,
        conversation.id,
        message,
        customerId,
        channel,
      );

      // Record bot response（tenantId 写入可信 tenant context）
      await this.prisma.message.create({
        data: {
          id: uuidv4(),
          content: aiResult.response,
          conversationId: conversation.id,
          role: 'bot',
          tenantId,
        },
      });

      return {
        response: aiResult.response,
        isLimited: false,
        intent: aiResult.intent,
        leadScore: aiResult.leadScore,
        leadLevel: aiResult.leadLevel,
        stage: aiResult.stage,
        recommendations: aiResult.recommendations,
      };
    } catch (error) {
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

  async getSalesResponse(
    tenantId: string,
    botId: string,
    customerId: string,
    message: string,
    conversation?: Conversation & {
      messages?: Message[];
      customer?: Customer;
    },
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
  }> {
    return this.aiPipelineService.generateSalesResponse(
      tenantId,
      botId,
      customerId,
      message,
      conversation,
      channel,
    );
  }

  async findOrCreateCustomer(
    platformId: string,
    channel: string,
    tenantId: string,
    metadata: any = {},
  ): Promise<any> {
    // Try to find existing customer
    let customer = await this.prisma.customer.findFirst({
      where: {
        tenantId,
      },
    });

    if (customer) {
      return customer;
    }

    // Create new customer
    customer = await this.prisma.customer.create({
      data: {
        id: uuidv4(),
        tenantId,
        name: metadata.name || `${channel} User`,
        email: metadata.email,
        phone: metadata.phone,
      },
    });

    return customer;
  }

  async recordMessage(
    tenantId: string,
    conversationId: string,
    message: string,
    isFromBot: boolean,
    customerId?: string,
    intent?: string,
    keywords?: string[],
    confidence?: number,
    action?: string,
    products?: any,
    metadata?: any,
  ): Promise<any> {
    return this.prisma.message.create({
      data: {
        id: uuidv4(),
        conversationId,
        content: message,
        role: isFromBot ? 'bot' : (customerId || 'user'),
        tenantId,
      },
    });
  }

  async updateConversationWithCustomer(
    conversationId: string,
    customerId: string,
  ): Promise<any> {
    // customerId field doesn't exist in Conversation model
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {}, // No customerId field to update
    });
  }

  async createLeadIfNotExists(
    customerId: string,
    tenantId: string,
    score: number = 10,
  ): Promise<void> {
    await this.prisma.lead.upsert({
      where: {
        customerId_tenantId: {
          customerId,
          tenantId,
        }
      },
      create: {
        id: uuidv4(),
        customerId,
        tenantId,
        intentScore: score,
      },
      update: {
        intentScore: { increment: score },
      },
    });
  }


  /**
   * Simple chat entry point (used by channel adapters)
   * P0-5A：tenant 身份必须来自 bot 归属，删除 "findFirst 随机租户" 兑底（防跨 tenant 注入）。
   * bot 不存在/未提供 → 拒绝（不再写进任意租户）。
   */
  async chat(
    message: string,
    systemPrompt: string = '',
    history: any[] = [],
    botId?: string,
  ): Promise<string> {
    try {
      if (!botId) {
        throw new NotFoundException('botId is required');
      }
      const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
      if (!bot) {
        throw new NotFoundException('Bot not found');
      }
      const tenantId = bot.tenantId;
      const conversationId = 'wx-' + Date.now();
      const result = await this.processMessage(
        tenantId,
        botId,
        conversationId,
        message,
        undefined,
        'wechat',
      );
      return result.response || '抱歉，暂时无法回复';
    } catch (error: any) {
      if (
        error instanceof QuotaExceededException ||
        error instanceof SubscriptionExpiredException
      ) {
        throw error;
      }
      this.logger.error(`Chat error: ${error.message}`);
      return '抱歉，服务暂时不可用';
    }
  }
}
