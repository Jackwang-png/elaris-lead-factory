import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentExecutionService } from './execution/payment-execution.service';
import { PaymentProvidersModule } from './payment-providers.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * T2.8 — PaymentModule DI wiring.
 *
 *   PaymentModule
 *     ↓ imports PaymentProvidersModule (exports PaymentProviderRegistry + providers)
 *     ↓ providers: PaymentExecutionService (consumes the registry via DI)
 *     ↓ PaymentService (business orchestration only)
 *
 * No Controller route / business provider changes.
 */
@Module({
  imports: [PaymentProvidersModule, AuditModule, PrismaModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentExecutionService],
  exports: [PaymentService],
})
export class PaymentModule {}
