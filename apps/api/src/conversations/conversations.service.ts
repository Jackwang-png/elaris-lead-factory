import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * P0-5A 修复：
 *   - addMessage 参数错位 bug：controller 传 (id, content, tenantId)，
 *     旧签名 (conversationId, role, content) 会把 content 写进 role、tenantId 写进 content。
 *     新签名 (conversationId, content, tenantId, role?)。
 *   - 跨 tenant 会话禁止写入：会话必须属于当前 tenant（否则 404，不泄露存在性）。
 *   - Message.tenantId 一律写入可信 tenant context。
 */
@Injectable()
export class ConversationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.conversation.findMany({
      where: {
        tenantId
      },
      include: {
        bot: true,
        messages: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string, tenantId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id,
        tenantId
      },
      include: {
        bot: true,
        messages: true
      }
    });
    if (!conversation) {
      // P0-5A：跨 tenant / 不存在 → 404（不泄露存在性，与 /api/v2 一致）
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  /**
   * 向会话追加一条消息。
   * @param conversationId 会话 ID
   * @param content 消息内容（必填）
   * @param tenantId 可信 tenant context（来自 JWT，不来自 body）
   * @param role 消息角色（默认 'user'）
   */
  async addMessage(
    conversationId: string,
    content: string,
    tenantId: string,
    role: string = 'user',
  ) {
    const text = (content || '').trim();
    if (!text) {
      throw new BadRequestException('content is required');
    }
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { id: true },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return this.prisma.message.create({
      data: {
        conversationId,
        role,
        content: text,
        tenantId,
      },
    });
  }

  async getOrCreateConversation(botId: string, visitor: string, tenantId: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        botId,
        visitor,
        tenantId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          botId,
          visitor,
          tenantId
        }
      });
    }

    return conversation;
  }
}
