import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
    private prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        throw new UnauthorizedException('No token provided');
      }
      const payload = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
      this.logger.log(`Client connected: ${client.id}, user: ${payload.sub}`);
    } catch (err) {
      this.logger.warn(`Client rejected: ${client.id} - ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() data: { conversationId: string; content: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      const payload = await this.jwtService.verifyAsync(token);
      const tenantId = payload.tenantId;

      const result = await this.chatService.processMessage(
        tenantId,
        '', // botId
        data.conversationId,
        data.content,
      );

      this.server.to(data.conversationId).emit('message', {
        sender: 'user',
        content: data.content,
        timestamp: new Date(),
      });

      this.server.to(data.conversationId).emit('message', {
        sender: 'bot',
        content: result.response,
        timestamp: new Date(),
        metadata: {
          intent: result.intent,
          leadScore: result.leadScore,
          leadLevel: result.leadLevel,
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error handling message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    // P0-5A：加入会话房间前校验归属（跨 tenant 会话不可加入/监听）
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      const payload = await this.jwtService.verifyAsync(token);
      const tenantId = payload?.tenantId;
      if (!tenantId) return { success: false, error: 'unauthorized' };

      const conv = await this.prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { id: true },
      });
      if (!conv) return { success: false, error: 'conversation not found' };

      client.join(conversationId);
      this.logger.log(`Client ${client.id} joined conversation ${conversationId}`);
      return { success: true };
    } catch (err) {
      this.logger.warn(`joinConversation rejected: ${client.id} - ${err.message}`);
      return { success: false, error: 'unauthorized' };
    }
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @MessageBody() conversationId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(conversationId);
    this.logger.log(`Client ${client.id} left conversation ${conversationId}`);
    return { success: true };
  }
}
