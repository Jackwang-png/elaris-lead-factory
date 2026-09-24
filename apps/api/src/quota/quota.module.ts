import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { UsageModule } from '../usage/usage.module';
import { AiQuotaService } from './ai-quota.service';
import { QuotaController } from './quota.controller';

@Module({
  imports: [PrismaModule, SubscriptionModule, UsageModule],
  controllers: [QuotaController],
  providers: [AiQuotaService],
  exports: [AiQuotaService],
})
export class QuotaModule {}
