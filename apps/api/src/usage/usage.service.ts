import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsageService {
  constructor(private prisma: PrismaService) {}

  async recordUsage(tenantId: string, messageCount: number, tokenUsage: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.usage.findUnique({
      where: { tenantId_date: { tenantId, date: today } },
    });

    if (existing) {
      await this.prisma.usage.update({
        where: { tenantId_date: { tenantId, date: today } },
        data: {
          messageCount: { increment: messageCount },
          tokenUsage: { increment: tokenUsage },
        },
      });
    } else {
      await this.prisma.usage.create({
        data: {
          date: today,
          tenantId,
          messageCount,
          tokenUsage,
        },
      });
    }
  }

  async checkLimit(tenantId: string): Promise<boolean> {
    // For now, we'll just pass through
    // In a real implementation, you would check the tenant's usage limit
    return true;
  }

  async checkDailyLimit(tenantId: string): Promise<boolean> {
    // Backward compatibility
    return this.checkLimit(tenantId);
  }

  async getDailyUsage(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const usage = await this.prisma.usage.findUnique({
      where: { tenantId_date: { tenantId, date: today } },
    });

    return usage || { messageCount: 0, tokenUsage: 0 };
  }

  async getMonthlyUsage(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const usages = await this.prisma.usage.findMany({
      where: {
        tenantId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const totalMessages = usages.reduce((sum, u) => sum + u.messageCount, 0);
    const totalTokens = usages.reduce((sum, u) => sum + u.tokenUsage, 0);

    return {
      totalMessages,
      totalTokens,
      days: usages.length,
    };
  }
}
