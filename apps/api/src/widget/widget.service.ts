import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiPipelineService } from '../ai/pipeline/ai-pipeline.service';

/**
 * 客户侧 widget 聊天服务（公开接口，无 JWT）。
 *
 * - POST /widget/chat：客户发消息 → AI 回复（无法回答时自动转人工并返回转接话术）
 * - GET  /widget/history：客户按 visitorId 回读会话历史（含人工客服回复）
 *
 * 会话归属校验：history 仅允许 conversation.visitor === visitorId 时读取。
 */
@Injectable()
export class WidgetService {
  constructor(
    private prisma: PrismaService,
    private aiPipeline: AiPipelineService,
  ) {}

  async chat(botId?: string, visitorId?: string, message?: string) {
    if (!botId) throw new BadRequestException('botId 必填');
    if (!visitorId) throw new BadRequestException('visitorId 必填');
    const text = (message || '').trim();
    if (!text) throw new BadRequestException('message 不能为空');

    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundException('Bot 不存在');

    // 同一访客 + 同一 bot 复用会话（历史连续）
    let conversation = await this.prisma.conversation.findFirst({
      where: { botId, visitor: visitorId, tenantId: bot.tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          botId,
          visitor: visitorId,
          tenantId: bot.tenantId,
          channel: 'webchat',
        },
      });
    }

    const result = await this.aiPipeline.processMessage(
      bot.tenantId,
      botId,
      conversation.id,
      text,
      undefined,
      'webchat',
    );

    return {
      response: result.response,
      conversationId: conversation.id,
      needsHuman: !!result.needsHuman,
    };
  }

  async history(conversationId?: string, visitorId?: string) {
    if (!conversationId) throw new BadRequestException('conversationId 必填');
    if (!visitorId) throw new BadRequestException('visitorId 必填');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('会话不存在');
    if (conversation.visitor !== visitorId) {
      throw new ForbiddenException('无权查看该会话');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      // role 更可靠：user / bot / agent
      sender:
        m.role === 'bot'
          ? 'bot'
          : m.role === 'agent'
            ? 'agent'
            : 'user',
      createdAt: m.createdAt,
    }));
  }
}
