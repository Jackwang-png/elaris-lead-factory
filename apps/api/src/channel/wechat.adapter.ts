import { Injectable } from '@nestjs/common';
import { ChannelAdapter, ChannelMessage } from './channel.interface';

@Injectable()
export class WechatAdapter implements ChannelAdapter {
  readonly channelName = 'wechat';

  async receiveMessage(): Promise<ChannelMessage | null> {
    // TODO: implement WeChat message receiving
    return null;
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    // TODO: implement WeChat sending
    console.log(`[WeChat] Sending to ${conversationId}: ${content}`);
  }

  verifyWebhook(payload: any): boolean {
    // TODO: implement WeChat signature verification
    return true;
  }

  async getCustomer(customerId: string): Promise<any> {
    // TODO: implement WeChat customer info retrieval
    return { id: customerId, name: 'WeChat User' };
  }

  async syncCustomer(platformId: string, tenantId: string): Promise<any> {
    // TODO: implement WeChat customer sync
    return { id: platformId, name: 'WeChat User' };
  }

  processMessage(message: any, botId: string, tenantId: string): Promise<ChannelMessage | null> {
    // Process incoming WeChat message
    return Promise.resolve({
      id: message.MsgId?.toString() || Date.now().toString(),
      content: message.Content,
      sender: message.FromUserName,
      timestamp: new Date(parseInt(message.CreateTime) * 1000),
      platformId: message.FromUserName,
    });
  }
}
