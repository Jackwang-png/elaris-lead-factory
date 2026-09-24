import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { HandoffController } from './handoff.controller';
import { HandoffService } from './handoff.service';
import { ServerChanService } from './serverchan.service';

/**
 * 转人工客服模块。
 * HandoffService 导出供 AiPipelineService 集成触发逻辑。
 */
@Module({
  imports: [PrismaModule, ConfigModule, AuditModule],
  controllers: [HandoffController],
  providers: [HandoffService, ServerChanService],
  exports: [HandoffService],
})
export class HandoffModule {}
