import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { AiQuotaService } from '../quota/ai-quota.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('chat')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly aiQuotaService: AiQuotaService,
  ) {}

  @Post('message')
  async sendMessage(
    @Body() body: SendMessageDto,
    @Req() req,
  ) {
    // 预检订阅有效 + 仍有额度（无额度直接返回明确错误 code）
    await this.aiQuotaService.assertCanRespond(req.tenantId);

    return this.chatService.processMessage(
      req.tenantId,
      body.botId,
      body.conversationId,
      body.message,
    );
  }
}
