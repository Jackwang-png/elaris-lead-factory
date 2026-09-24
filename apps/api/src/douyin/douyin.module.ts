import { Module } from '@nestjs/common';
import { DouyinController } from './douyin.controller';
import { DouyinService } from './douyin.service';
import { DouyinAccountService } from './douyin-account.service';
import { DouyinUserService } from './douyin-user.service';
import { DouyinMessageService } from './douyin-message.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    ChannelModule
  ],
  controllers: [DouyinController],
  providers: [
    DouyinService,
    DouyinAccountService,
    DouyinUserService,
    DouyinMessageService
  ],
  exports: [
    DouyinService,
    DouyinAccountService,
    DouyinUserService,
    DouyinMessageService
  ]
})
export class DouyinModule {}
