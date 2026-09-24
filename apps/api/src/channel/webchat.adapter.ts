import { Injectable } from '@nestjs/common';
import { ChannelAdapter, ChannelMessage } from './channel.interface';

@Injectable()
export class WebchatAdapter implements ChannelAdapter {
  readonly channelName = 'webchat';

  // In-memory message queue for demo
  private messageQueue: ChannelMessage[] = [];

  async receiveMessage(): Promise<ChannelMessage | null> {
    return this.messageQueue.shift() || null;
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    // In a real app, push to a database or WebSocket
    console.log(`[Webchat] Sending to conversation ${conversationId}: ${content}`);
  }

  verifyWebhook(payload: any): boolean {
    // Webchat doesn't typically use webhooks
    return true;
  }

  async getCustomer(customerId: string): Promise<any> {
    // Placeholder
    return { id: customerId, name: 'Web User' };
  }

  async syncCustomer(platformId: string, tenantId: string): Promise<any> {
    // Placeholder
    return { id: platformId, name: 'Web User' };
  }

  processMessage(message: any, botId: string, tenantId: string): Promise<ChannelMessage | null> {
    // Process incoming webchat message
    return Promise.resolve({
      id: message.id || Date.now().toString(),
      content: message.content,
      sender: message.sender,
      timestamp: new Date(),
      platformId: message.sender,
    });
  }
}
