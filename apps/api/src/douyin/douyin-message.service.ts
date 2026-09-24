import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { DouyinUserService } from './douyin-user.service';

/**
 * 抖音消息处理 Service
 * 负责接收抖音 webhook 消息并触发 AI 回复
 *
 * 说明：消息记录使用 ChannelMessage 模型（带 channel/externalUserId 字段），
 * 而非 Message 模型，因为后者面向内部会话。
 */
@Injectable()
export class DouyinMessageService {
  private readonly logger = new Logger(DouyinMessageService.name);

  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
    private douyinUserService: DouyinUserService,
  ) {}

  /**
   * 处理来自抖音的消息
   * @param message 抖音 webhook 推送的消息体
   * @param account 抖音账号配置（Bot 记录）
   * @param tenantId 租户 ID
   */
  async processMessage(message: any, account: any, tenantId: string): Promise<string> {
    this.logger.log(`Processing douyin message for tenant ${tenantId}`);

    // 从消息体中提取 openId 与文本内容（结构与抖音官方 webhook 一致）
    const openId: string | undefined = message?.from_user_id || message?.openId;
    const text: string = message?.content?.text || message?.text || '';

    if (!openId) {
      this.logger.warn('Missing openId in douyin message, skipping');
      return 'ignored';
    }

    // 上报客户信息
    const customer = await this.douyinUserService.upsertByOpenId(
      openId,
      tenantId,
      account?.id,
      message?.from_user,
    );

    // 落库消息记录（使用 ChannelMessage 模型）
    await this.prisma.channelMessage.create({
      data: {
        tenantId,
        channel: 'douyin',
        externalUserId: openId,
        content: text,
        direction: 'inbound',
        customerId: customer?.id,
        metadata: { raw: message },
      },
    });

    // 触发 AI 回复
    try {
      const reply = await this.aiService.chat(text, '', [], account?.id);
      return reply;
    } catch (err) {
      this.logger.error(`AI reply failed: ${(err as Error).message}`);
      return '抱歉，系统暂时无法回复。';
    }
  }
}
