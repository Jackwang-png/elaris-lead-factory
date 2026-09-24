import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // 租户（商家）列表
  async listTenants(page = 1, limit = 20, search = '') {
    const where = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, bots: true, customers: true } },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  // 用户列表
  async listUsers(page = 1, limit = 20, search = '') {
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, username: true, firstName: true,
          role: true, tenantId: true, createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  // 设置用户角色
  async setUserRole(userId: string, role: string) {
    if (!['admin', 'merchant', 'user'].includes(role)) {
      throw new Error('非法角色');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });
  }

  // 平台统计
  async platformStats() {
    const [tenants, users, bots, customers, conversations, messages, leads, knowledge] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.user.count(),
        this.prisma.bot.count(),
        this.prisma.customer.count(),
        this.prisma.conversation.count(),
        this.prisma.message.count(),
        this.prisma.lead.count(),
        this.prisma.knowledge.count(),
      ]);
    return {
      tenants, users, bots, customers, conversations, messages, leads, knowledge,
    };
  }

  // 租户详情
  async tenantDetail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        _count: { select: { users: true, bots: true, customers: true, conversations: true, leads: true, knowledge: true } },
      },
    });
    if (!tenant) throw new Error('租户不存在');
    return tenant;
  }
}
