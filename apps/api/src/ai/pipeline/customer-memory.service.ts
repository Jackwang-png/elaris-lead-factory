import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CustomerMemoryService {
  constructor(private prisma: PrismaService) {}

  async getMemoriesByCustomer(customerId: string, botId: string) {
    return this.prisma.salesMemory.findMany({
      where: {
        customerId,
        botId,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveMemory(params: {
    botId: string;
    customerId: string;
    key: string;
    value: any;
    source?: string;
    tenantId?: string;
  }) {
    const { botId, customerId, key, value, tenantId = '' } = params;

    // Get existing memory
    const existing = await this.prisma.salesMemory.findFirst({
      where: {
        botId,
        customerId,
        key,
      },
    });

    if (existing) {
      return this.prisma.salesMemory.update({
        where: { id: existing.id },
        data: {
          content: JSON.stringify(value),
          updatedAt: new Date(),
        },
      });
    } else {
      return this.prisma.salesMemory.create({
        data: {
          id: uuidv4(),
          botId,
          customerId,
          key,
          content: JSON.stringify(value),
          type: typeof value,
          tenantId,
        },
      });
    }
  }

  async getCustomerProfile(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return null;
    }

    // Extract profile data from memories
    const memories = await this.prisma.salesMemory.findMany({
      where: { customerId },
      orderBy: { updatedAt: 'desc' },
    });

    const profile = {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      identities: [], // Will be populated if identities relation exists
      conversations: 0, // Will be calculated separately
      lastContact: null, // Will be calculated separately
      memories: memories.map((m) => JSON.parse(m.content as string)),
      interests: [] as any[],
      preferences: {} as any,
    };

    // Extract interests from memories
    for (const memory of memories) {
      const memObj = memory.memory as any;
      if (memObj?.interests) {
        profile.interests.push(...memObj.interests);
      }
    }

    return profile;
  }

  async updateCustomerProfile(customerId: string, updates: Record<string, any>) {
    const updateData: any = {};

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'name' || key === 'email' || key === 'phone') {
        updateData[key] = value;
      }
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data: updateData,
    });
  }

  async extractContactInfoFromMessage(message: string): Promise<{
    phone?: string;
    email?: string;
    wechat?: string;
  }> {
    const contactInfo: {
      phone?: string;
      email?: string;
      wechat?: string;
    } = {};

    // Extract phone number
    const phonePattern = /1[3-9]\d{9}/;
    const phoneMatch = message.match(phonePattern);
    if (phoneMatch) {
      contactInfo.phone = phoneMatch[0];
    }

    // Extract email
    const emailPattern = /[\w.-]+@[\w.-]+\.\w+/;
    const emailMatch = message.match(emailPattern);
    if (emailMatch) {
      contactInfo.email = emailMatch[0];
    }

    // Extract WeChat
    const wechatPatterns = [
      /微信[:：]\s*([a-zA-Z0-9_-]{6,20})/,
      /wx[:：]\s*([a-zA-Z0-9_-]{6,20})/,
      /(?:微信|wx)[^\w]*([a-zA-Z0-9_-]{6,20})/,
    ];

    for (const pattern of wechatPatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        contactInfo.wechat = match[1];
        break;
      }
    }

    return contactInfo;
  }
}
