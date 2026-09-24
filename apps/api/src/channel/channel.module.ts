import { Module } from '@nestjs/common';
import { ChannelService } from './channel.service';
import { ChannelWebhookController } from './channel.controller';
import { WebchatAdapter } from './webchat.adapter';
import { WechatAdapter } from './wechat.adapter';
import { TaobaoAdapter } from './taobao.adapter';
import { WecomAdapter } from './wecom.adapter';
import { WebhookSecurityService } from './webhook-security.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [PrismaModule, AiModule, CustomerModule],
  controllers: [ChannelWebhookController],
  providers: [
    ChannelService,
    WebchatAdapter,
    WechatAdapter,
    TaobaoAdapter,
    WecomAdapter,
    WebhookSecurityService,
  ],
  exports: [ChannelService, WebhookSecurityService],
})
export class ChannelModule {}
