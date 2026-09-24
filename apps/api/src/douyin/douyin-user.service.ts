import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 抖音用户 Service
 * 负责查询/创建来自抖音渠道的客户
 *
 * 说明：Customer 模型未提供 externalId 字段，此处使用 email 字段承载
 * 抖音 openId（格式：douyin_<openId>@placeholder），以实现去重。
 */
@Injectable()
export class DouyinUserService {
  private readonly logger = new Logger(DouyinUserService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 根据抖音 openId 查询客户，不存在则创建
   */
  async upsertByOpenId(openId: string, tenantId: string, botId?: string, profile?: any) {
    const email = `douyin_${openId}@placeholder`;

    const existing = await this.prisma.customer.findFirst({
      where: { email, tenantId },
    });

    if (existing) {
      // 仅在有新资料时更新 name
      if (profile?.nickname || profile?.name) {
        return this.prisma.customer.update({
          where: { id: existing.id },
          data: { name: profile.nickname || profile.name },
        });
      }
      return existing;
    }

    return this.prisma.customer.create({
      data: {
        tenantId,
        botId: botId || undefined,
        email,
        name: profile?.nickname || profile?.name || `抖音用户_${openId.slice(-6)}`,
        status: 'active',
      },
    });
  }

  /**
   * 根据 openId 查询客户
   */
  async findByOpenId(openId: string, tenantId: string) {
    return this.prisma.customer.findFirst({
      where: {
        tenantId,
        email: `douyin_${openId}@placeholder`,
      },
    });
  }
}
