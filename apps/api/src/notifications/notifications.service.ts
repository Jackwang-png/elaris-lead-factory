import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 通知服务
 * 管理租户内的系统通知
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取通知列表 */
  async list(tenantId: string, page = 1, limit = 20) {
    // 使用审计日志作为通知来源（近期操作记录）
    const where = { tenantId };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          resource: true,
          success: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    // 转换为通知格式
    const notifications = items.map((log) => ({
      id: log.id,
      type: log.success ? 'info' : 'warning',
      title: this.getActionTitle(log.action),
      message: `${log.resource} 操作${log.success ? '成功' : '失败'}`,
      read: false,
      createdAt: log.createdAt.toISOString(),
      user: log.user?.name || log.user?.email || '系统',
    }));

    return { items: notifications, total, page, limit };
  }

  /** 未读通知数量 */
  async unreadCount(tenantId: string) {
    // 简化：返回最近 24 小时内的审计日志数作为"未读"
    const yesterday = new Date(Date.now() - 86400000);
    const count = await this.prisma.auditLog.count({
      where: { tenantId, createdAt: { gte: yesterday } },
    });
    return { count };
  }

  private getActionTitle(action: string): string {
    const titles: Record<string, string> = {
      LOGIN: '用户登录',
      LOGOUT: '用户登出',
      REGISTER: '新用户注册',
      CREATE: '创建操作',
      UPDATE: '更新操作',
      DELETE: '删除操作',
    };
    return titles[action] || '系统通知';
  }
}
