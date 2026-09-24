import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 系统设置服务
 * 管理租户级别的系统设置和用户偏好
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取当前租户的设置 */
  async getSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    // 当前用户的订阅信息
    const subscription = await this.prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
    });

    return {
      tenant,
      subscription: subscription
        ? {
            planName: subscription.plan.name,
            dailyLimit: subscription.plan.dailyLimit,
            status: subscription.status,
            expiresAt: subscription.expireAt,
          }
        : null,
      // 通用设置（后续可扩展为独立的 Settings 表）
      preferences: {
        language: 'zh-CN',
        timezone: 'Asia/Shanghai',
        notificationEnabled: true,
        autoReplyEnabled: true,
      },
    };
  }

  /** 更新设置 */
  async updateSettings(tenantId: string, updates: Record<string, any>) {
    // 更新租户名称
    if (updates.tenantName) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { name: updates.tenantName },
      });
    }

    return { success: true, message: '设置已更新' };
  }
}
