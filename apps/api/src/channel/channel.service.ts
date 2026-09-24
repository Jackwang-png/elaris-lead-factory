import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CustomerService } from '../customer/customer.service';
import { ChannelAdapter, ChannelMessage } from './channel.interface';
import { WebchatAdapter } from './webchat.adapter';
import { WechatAdapter } from './wechat.adapter';
import { TaobaoAdapter } from './taobao.adapter';
import { WecomAdapter } from './wecom.adapter';

@Injectable()
export class ChannelService implements OnModuleInit {
  private readonly logger = new Logger(ChannelService.name);
  private adapters: Map<string, ChannelAdapter> = new Map();

  constructor(
    private readonly webchatAdapter: WebchatAdapter,
    private readonly wechatAdapter: WechatAdapter,
    private readonly taobaoAdapter: TaobaoAdapter,
    private readonly wecomAdapter: WecomAdapter,
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly customerService: CustomerService,
  ) {}

  private salesWorkflowService: any = {
    create: async (botId: string, conversationId: string, event: string, data: any, tenantId: string) => {
      console.log(`Sales workflow event: ${event}`);
      return { success: true };
    }
  };

  onModuleInit() {
    this.registerAdapter(this.webchatAdapter);
    this.registerAdapter(this.wechatAdapter);
    this.registerAdapter(this.taobaoAdapter);
    this.registerAdapter(this.wecomAdapter);
  }

  private registerAdapter(adapter: ChannelAdapter) {
    this.adapters.set(adapter.channelName, adapter);
    this.logger.log(`Registered channel adapter: ${adapter.channelName}`);
  }

  getAdapter(channel: string): ChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  /**
   * 统一处理渠道入站消息：验签 → 解析 → AI 处理 → 回发（各步失败不抛异常，返回结果供 controller 决策）。
   * @returns { ok: 是否整体成功; verified: 是否通过验签; reason?: 失败原因 }
   */
  async processIncomingMessage(
    channel: string,
    payload: any,
    botId: string,
    tenantId: string,
  ): Promise<{ ok: boolean; verified: boolean; reason?: string }> {
    const adapter = this.getAdapter(channel);
    if (!adapter) {
      this.logger.error(`No adapter found for channel: ${channel}`);
      return { ok: false, verified: false, reason: `no adapter for channel: ${channel}` };
    }

    if (!adapter.verifyWebhook(payload)) {
      this.logger.error(`Webhook verification failed for channel: ${channel}`);
      return { ok: false, verified: false, reason: 'signature verification failed' };
    }

    const channelMessage = await adapter.processMessage(payload, botId, tenantId);
    if (!channelMessage) {
      this.logger.error(`Failed to process message from channel: ${channel}`);
      return { ok: false, verified: true, reason: 'unprocessable message' };
    }

    // Find or create customer
    const customer = await this.aiService.findOrCreateCustomer(
      channelMessage.platformId,
      channel,
      tenantId,
      {},
    );

    // Process through AI pipeline
    const aiResult = await this.aiService.processMessage(
      tenantId,
      botId,
      channelMessage.platformId, // Using platformId as conversationId
      channelMessage.content,
      customer.id,
      channel,
    );

    // 把 AI 回复发回渠道（凭证未配的渠道适配器内部会告警降级）
    if (aiResult && aiResult.response && !aiResult.error) {
      try {
        await adapter.sendMessage(channelMessage.platformId, aiResult.response);
      } catch (e) {
        this.logger.error(`Failed to send reply via channel ${channel}: ${(e as Error).message}`);
      }
    }

    return { ok: true, verified: true };
  }

  async sendMessage(channel: string, conversationId: string, content: string): Promise<void> {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`No adapter found for channel: ${channel}`);
    }
    await adapter.sendMessage(conversationId, content);
  }

  async syncCustomer(channel: string, platformId: string, tenantId: string): Promise<any> {
    const adapter = this.getAdapter(channel);
    if (!adapter) {
      throw new Error(`No adapter found for channel: ${channel}`);
    }

    const customerData = await adapter.syncCustomer(platformId, tenantId);
    const customer = await this.aiService.findOrCreateCustomer(
      platformId,
      channel,
      tenantId,
      customerData,
    );

    return customer;
  }

  async getChannelStats(tenantId: string, channel: string, date: Date) {
    // Placeholder implementation
    return null;
  }
}
