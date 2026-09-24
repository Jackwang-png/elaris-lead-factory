export interface ChannelMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  platformId: string;
  metadata?: any;
}

export interface ChannelAdapter {
  readonly channelName: string;
  receiveMessage(): Promise<ChannelMessage | null>;
  sendMessage(conversationId: string, content: string): Promise<void>;
  verifyWebhook(payload: any): boolean;
  getCustomer(customerId: string): Promise<any>;
  syncCustomer(platformId: string, tenantId: string): Promise<any>;
  processMessage(message: any, botId: string, tenantId: string): Promise<ChannelMessage | null>;
}
