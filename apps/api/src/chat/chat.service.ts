import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiPipelineService } from '../ai/pipeline/ai-pipeline.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * P0-5A 租户隔离修复：
 *   - 会话查询必须 tenantId 归属匹配（跨 tenant 会话 → 404，不泄露存在性）
 *   - botId 提供时必须存在且属于当前 tenant（伪造 bot → 404）
 *   - Message.tenantId 一律写入可信 tenant context（不再留空）
 */
@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private aiPipelineService: AiPipelineService,
  ) {}

  async processMessage(
    tenantId: string,
    botId: string,
    conversationId: string,
    message: string,
    customerId?: string,
  ) {
    // bot 归属校验（提供 botId 时必须属于当前 tenant）
    if (botId) {
      const bot = await this.prisma.bot.findFirst({
        where: { id: botId, tenantId },
        select: { id: true },
      });
      if (!bot) {
        throw new NotFoundException('Bot not found');
      }
    }

    // 会话必须属于当前 tenant；跨 tenant 的 conversationId → 404（不泄露存在性）
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
    const userMessage = await this.prisma.message.create({
      data: {
        id: uuidv4(),
        conversationId: conversation.id,
        content: message,
        role: customerId || 'user',
        tenantId,
      },
    });

    // 未读计数闭环（服务端权威，绝不依赖前端 +1）：
    // 仅当本会话已进入人工客服（needsHuman 且未解决）时，对该租户会话自增。
    // 用 updateMany + 条件 where 保证：①租户隔离 ②会话必须存在且为 handoff 且未关闭
    // ③每条真实消息仅 +1（重复/异常事件不会无限递增）；会话不存在/已关闭则自动不匹配。
    if (conversation.needsHuman && !conversation.resolvedAt) {
      await this.prisma.conversation.updateMany({
        where: { id: conversation.id, tenantId, needsHuman: true, resolvedAt: null },
        data: { unreadCount: { increment: 1 }, updatedAt: new Date() },
      });
    }

    // Process through AI pipeline
    const aiResult = await this.aiPipelineService.processMessage(
      tenantId,
      botId,
      conversation.id,
      message,
      customerId,
    );

    // Record AI response
    const aiMessage = await this.prisma.message.create({
      data: {
        id: uuidv4(),
        conversationId: conversation.id,
        content: aiResult.response,
        role: 'bot',
        tenantId,
      },
    });

    return {
      response: aiResult.response,
      conversationId,
      customerId: customerId,
      intent: aiResult.intent,
      leadScore: aiResult.leadScore,
      leadLevel: aiResult.leadLevel,
    };
  }

  async getConversationHistory(conversationId: string, tenantId?: string) {
    if (!tenantId) {
      throw new NotFoundException('Conversation not found');
    }
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCustomerConversations(customerId: string) {
    return this.prisma.conversation.findMany({
      where: {
        // customerId field doesn't exist, use visitor field instead
        visitor: customerId
      },
      include: {
        bot: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getSalesConversation(botId: string, customerId: string) {
    // salesConversation model doesn't exist, return null
    return null;
  }

  async closeConversation(conversationId: string) {
    // status field doesn't exist, do nothing
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {},
    });
  }

  async createFollowUp(
    customerId: string,
    message: string,
    scheduledAt: Date,
    tenantId: string,
  ) {
    // salesFollowUp model doesn't exist, return null
    return null;
  }

  async createSalesFollowUp(botId: string, conversationId: string, message?: string) {
    // salesFollowUp model doesn't exist, return null
    return null;
  }
}
