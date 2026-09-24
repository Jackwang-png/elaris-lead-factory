import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AiProvidersModule } from '../ai/providers/ai-providers.module';
import { WorkforceTenantGuard } from '../workforce/workforce-tenant.guard';
import { LeadIntelligenceService } from './lead-intelligence.service';
import { LeadIntelligenceRepository } from './lead-intelligence.repository';
import { MessageDraftService } from './message-draft.service';
import { LeadIntelligenceController } from './lead-intelligence.controller';
import { LeadIntelligencePromptBuilder } from './lead-intelligence.prompt-builder';
import { LeadIntelligenceSchema } from './lead-intelligence.schema';
import { LeadIntelligenceThrottler } from './lead-intelligence.throttler';
import { LeadIntelligenceAudit } from './lead-intelligence.audit';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AiProvidersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'smartcs-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [
    LeadIntelligenceService,
    LeadIntelligenceRepository,
    MessageDraftService,
    LeadIntelligencePromptBuilder,
    LeadIntelligenceSchema,
    LeadIntelligenceThrottler,
    LeadIntelligenceAudit,
    WorkforceTenantGuard,
  ],
  controllers: [LeadIntelligenceController],
  exports: [LeadIntelligenceService, MessageDraftService],
})
export class LeadIntelligenceModule {}
