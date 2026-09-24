import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';

/**
 * P0-5B.1: mechanical migration — the bare OpenAI client is replaced by the
 * provider registry (business code must not construct SDK clients).
 * Summary prompt / logic are UNCHANGED.
 * NOTE: this service is dead code (PipelineModule is never imported; no
 * runtime reference) — it is preserved as-is, NOT revived (report §19).
 */
@Injectable()
export class MemoryService {
  constructor(
    private prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
  ) {}

  /**
   * Retrieve customer memory for a given bot and visitor.
   * Returns a string summarizing previous interactions and customer context.
   */
  async getCustomerMemory(
    botId: string,
    visitor: string,
    tenantId: string
  ): Promise<string> {
    // Find the most recent conversation for this bot and visitor
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        botId,
        visitor,
        tenantId
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc'
          },
          take: 10 // last 10 messages
        }
      }
    });

    if (!conversation || conversation.messages.length === 0) {
      return '';
    }

    // Build a summary of the conversation
    let memory = '历史对话记录：\n\n';
    conversation.messages.forEach(msg => {
      const role = msg.role === 'user' ? '客户' : 'AI';
      memory += `${role}: ${msg.content}\n\n`;
    });

    // Try to find a lead associated with this conversation to get customer context
    const lead = await this.prisma.lead.findFirst({
      where: {
        conversationId: conversation.id,
        tenantId
      }
    });

    if (lead) {
      memory += '客户资料：\n';
      if (lead.name) {
        memory += `姓名: ${lead.name}\n`;
      }
      if (lead.company) {
        memory += `公司: ${lead.company}\n`;
      }
      if (lead.industry) {
        memory += `行业: ${lead.industry}\n`;
      }
      if (lead.phone) {
        memory += `电话: ${lead.phone}\n`;
      }
      if (lead.wechat) {
        memory += `微信: ${lead.wechat}\n`;
      }
      if (lead.email) {
        memory += `邮箱: ${lead.email}\n`;
      }
      if (lead.intentLevel) {
        memory += `购买意向: ${lead.intentLevel}\n`;
      }
      if (lead.intentScore !== null && lead.intentScore !== undefined) {
        memory += `意向分数: ${lead.intentScore}\n`;
      }
      memory += '\n';
    }

    return memory;
  }

  /**
   * Store a new message in the conversation.
   */
  async storeMessage(
    conversationId: string,
    role: string,
    content: string
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content
      }
    });
  }

  /**
   * Store or update customer context (name, company, etc.) in the lead record.
   */
  async storeCustomerContext(
    botId: string,
    visitor: string,
    tenantId: string,
    customerInfo: {
      name?: string;
      company?: string;
      industry?: string;
      platform?: string;
      phone?: string;
      wechat?: string;
      email?: string;
    }
  ): Promise<void> {
    // Find the most recent conversation for this bot and visitor
    const conversation = await this.prisma.conversation.findFirst({
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
      return;
    }

    // Find or create a lead for this conversation
    let lead = await this.prisma.lead.findFirst({
      where: {
        conversationId: conversation.id,
        tenantId
      }
    });

    if (lead) {
      // Update existing lead
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: customerInfo.name || lead.name,
          company: customerInfo.company || lead.company,
          industry: customerInfo.industry || lead.industry,
          platform: customerInfo.platform || lead.platform,
          phone: customerInfo.phone || lead.phone,
          wechat: customerInfo.wechat || lead.wechat,
          email: customerInfo.email || lead.email
        }
      });
    } else {
      // Create new lead
      await this.prisma.lead.create({
        data: {
          tenantId,
          botId,
          conversationId: conversation.id,
          name: customerInfo.name || "",
          company: customerInfo.company || null,
          industry: customerInfo.industry || null,
          platform: customerInfo.platform || null,
          phone: customerInfo.phone || null,
          wechat: customerInfo.wechat || null,
          email: customerInfo.email || null,
          source: 'ai',
          salesStatus: 'new',
          lastContactAt: new Date()
        }
      });
    }
  }

  /**
   * Generate a summary of the conversation using the OpenAI API.
   * @param conversationId - The ID of the conversation to summarize.
   * @returns A string with the summary.
   */
  async generateConversationSummary(
    conversationId: string
  ): Promise<string> {
    // Get all messages for this conversation
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    if (messages.length === 0) {
      return '';
    }

    // Build the conversation text
    let conversationText = '';
    messages.forEach(msg => {
      const role = msg.role === 'user' ? '客户' : 'AI';
      conversationText += `${role}: ${msg.content}\n\n`;
    });

    try {
      const completion = await this.registry.getDefault().chat({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你是一个对话总结助手。根据以下对话记录，生成一个简洁的总结。

总结应包括：
- 客户的主要需求和问题
- 客户表达的兴趣和偏好
- 客户提供的联系信息
- 客户的购买意向级别
- 建议的下一步行动

只返回总结文本，不要添加额外格式。`
          },
          {
            role: 'user',
            content: conversationText
          }
        ]
      });

      return completion.data || '';
    } catch (e) {
      // If AI call fails, return a simple summary
      return `对话共 ${messages.length} 条消息，最后一条消息时间: ${messages[messages.length - 1].createdAt.toISOString()}`;
    }
  }

  /**
   * Update the customer memory with new information from the conversation.
   * This method updates the lead record with the latest customer info and conversation summary.
   * @param botId - The bot ID.
   * @param visitor - The visitor identifier.
   * @param customerInfo - The customer information to update.
   * @param conversationId - The conversation ID.
   */
  async updateMemory(
    botId: string,
    visitor: string,
    tenantId: string,
    customerInfo: {
      name?: string;
      company?: string;
      industry?: string;
      platform?: string;
      phone?: string;
      wechat?: string;
      email?: string;
      interests?: string[];
      preferences?: any;
      purchaseHistory?: any[];
      tags?: any;
      buyingStage?: string;
    },
    conversationId?: string
  ): Promise<void> {
    // Find the lead for this conversation
    let lead = conversationId ? await this.prisma.lead.findFirst({
      where: {
        conversationId,
        tenantId
      }
    }) : null;

    if (!lead) {
      // Try to find by visitor if conversationId is not provided
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          botId,
          visitor,
          tenantId
        },
        orderBy: { createdAt: 'desc' }
      });

      if (conversation) {
        lead = await this.prisma.lead.findFirst({
          where: {
            conversationId: conversation.id,
            tenantId
          }
        });
      }
    }

    if (lead) {
      // Update existing lead with new info
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          name: customerInfo.name || lead.name,
          company: customerInfo.company || lead.company,
          industry: customerInfo.industry || lead.industry,
          platform: customerInfo.platform || lead.platform,
          phone: customerInfo.phone || lead.phone,
          wechat: customerInfo.wechat || lead.wechat,
          email: customerInfo.email || lead.email,
          interests: customerInfo.interests || lead.interests,
          preferences: customerInfo.preferences || lead.preferences,
          purchaseHistory: customerInfo.purchaseHistory ?? lead.purchaseHistory ?? undefined,
          tags: customerInfo.tags || lead.tags,
          buyingStage: customerInfo.buyingStage || lead.buyingStage,
          lastContactAt: new Date()
        }
      });
    } else if (conversationId) {
      // Create new lead if not exists
      await this.prisma.lead.create({
        data: {
          tenantId,
          botId,
          conversationId,
          name: customerInfo.name || "",
          company: customerInfo.company || null,
          industry: customerInfo.industry || null,
          platform: customerInfo.platform || null,
          phone: customerInfo.phone || null,
          wechat: customerInfo.wechat || null,
          email: customerInfo.email || null,
          interests: customerInfo.interests || [],
          preferences: customerInfo.preferences || {},
          purchaseHistory: customerInfo.purchaseHistory || [],
          tags: customerInfo.tags || [],
          buyingStage: customerInfo.buyingStage || null,
          source: 'ai',
          salesStatus: 'new',
          lastContactAt: new Date()
        }
      });
    }

    // Generate and store conversation summary if conversationId is provided
    if (conversationId) {
      const summary = await this.generateConversationSummary(conversationId);
      if (summary && lead) {
        await this.prisma.lead.update({
          where: {
            id: lead.id
          },
          data: {
            remark: summary
          }
        });
      }
    }
  }
}
