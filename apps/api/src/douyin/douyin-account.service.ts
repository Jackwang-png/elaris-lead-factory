import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 抖音账号管理 Service
 * 负责查询租户下的抖音 Bot 配置
 *
 * 说明：项目中渠道账号统一由 Bot 模型承载（通过 platform 字段区分渠道），
 * 因此此处使用 prisma.bot 进行查询，而非独立的 Channel 模型。
 */
@Injectable()
export class DouyinAccountService {
  private readonly logger = new Logger(DouyinAccountService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 根据 accountId(botId) 查询抖音账号配置
   */
  async getAccountById(accountId: string, tenantId: string) {
    return this.prisma.bot.findFirst({
      where: {
        id: accountId,
        tenantId,
      },
    });
  }

  /**
   * 查询租户下所有抖音账号
   */
  async listAccounts(tenantId: string) {
    return this.prisma.bot.findMany({
      where: {
        tenantId,
      },
    });
  }
}
