import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { WidgetController } from './widget.controller';
import { WidgetService } from './widget.service';

/**
 * 客户侧 widget 聊天模块（公开接口）。
 */
@Module({
  imports: [PrismaModule, AiModule],
  controllers: [WidgetController],
  providers: [WidgetService],
  exports: [WidgetService],
})
export class WidgetModule {}
