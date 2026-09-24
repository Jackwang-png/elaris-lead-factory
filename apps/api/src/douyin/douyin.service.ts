import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { DouyinMessageService } from './douyin-message.service';
import { DouyinAccountService } from './douyin-account.service';
import { DouyinUserService } from './douyin-user.service';

@Injectable()
export class DouyinService {
  private readonly logger = new Logger(DouyinService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private douyinMessageService: DouyinMessageService,
    private douyinAccountService: DouyinAccountService,
    private douyinUserService: DouyinUserService
  ) {}

  async processMessage(
    message: any,
    accountId: string,
    tenantId: string
  ): Promise<string> {
    const account = await this.douyinAccountService.getAccountById(accountId, tenantId);
    if (!account) {
      // 平台回调到未注册账号：业务性 404（此前 throw Error 会被包装成 500）
      throw new NotFoundException(`Douyin account ${accountId} not found`);
    }

    return this.douyinMessageService.processMessage(message, account, tenantId);
  }
}
