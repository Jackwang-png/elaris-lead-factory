export interface Bot {
  id: string;
  name: string;
  description?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  identities: {
    platform: string;
    platformId: string;
  }[];
}

export interface Conversation {
  id: string;
  channel: string;
  customerId: string;
  botId: string;
  lastMessage?: {
    content: string;
    createdAt: string;
  };
  updatedAt: string;
  messageCount: number;
}

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  createdAt: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: string;
  category?: string;
  createdAt: string;
  channels: string[];
}
