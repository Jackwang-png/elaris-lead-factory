import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { HunterModule } from '../hunter/hunter.module';

import { WorkforceTenantGuard } from './workforce-tenant.guard';
import { WorkforceThrottlerGuard } from './workforce-throttler.guard';
import { WorkforceAuditService } from './services/workforce-audit.service';
import { TenantApiKeyService } from './services/tenant-api-key.service';
import { CompanyService } from './services/company.service';
import { SignalService } from './services/signal.service';
import { LeadService } from './services/lead.service';
import { HunterService } from './services/hunter.service';
import { OpportunityService } from './services/opportunity.service';
import { ComplianceService } from './services/compliance.service';
import { HumanControlService } from './services/human-control.service';
import { ApprovalService } from './services/approval.service';
import { ApprovalExpirationService } from './approval-expiration.service';

import { SignalsController } from './controllers/signals.controller';
import { CompaniesController } from './controllers/companies.controller';
import { LeadsController } from './controllers/leads.controller';
import { HunterController } from './controllers/hunter.controller';
import { OpportunitiesController } from './controllers/opportunities.controller';
import { AuditController } from './controllers/audit.controller';
import { TenantApiKeysController } from './controllers/tenant-api-keys.controller';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApprovalsController } from './controllers/approvals.controller';

/**
 * P0-3 WorkforceModule —— /api/v2 适配层。
 *
 * Scout → IntelligenceSignal → Company/Lead → Hunter →
 * Qualified Lead → Opportunity/Support 全链路。
 * 全部接口带 Tenant 隔离（WorkforceTenantGuard）+ AuditLog。
 *
 * P0-4 Production Hardening：
 *   - ThrottlerModule：按 tenant 限流（WorkforceThrottlerGuard，默认 60 req/min/tenant；
 *     高风险写接口 @Throttle 20 req/min；Audit 查询 120 req/min）
 *   - ApprovalService：审批生命周期（事件溯源复用 AuditLog，不迁移 schema）
 *   - ApiKeysController：API Key 生命周期（list/revoke/activate）
 *   - ApprovalsController：审批 list/approve/reject
 */
@Module({
  imports: [
    PrismaModule,
    HunterModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'smartcs-secret-key',
      signOptions: { expiresIn: '7d' },
    }),
    ThrottlerModule.forRoot({
      errorMessage: 'Rate limit exceeded, please retry later',
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    SignalsController,
    CompaniesController,
    LeadsController,
    HunterController,
    OpportunitiesController,
    AuditController,
    TenantApiKeysController,
    ApiKeysController,
    ApprovalsController,
  ],
  providers: [
    WorkforceTenantGuard,
    WorkforceThrottlerGuard,
    WorkforceAuditService,
    TenantApiKeyService,
    CompanyService,
    SignalService,
    LeadService,
    HunterService,
    OpportunityService,
    ComplianceService,
    HumanControlService,
    ApprovalService,
    ApprovalExpirationService,
  ],
  exports: [
    WorkforceAuditService,
    CompanyService,
    SignalService,
    LeadService,
    HunterService,
    OpportunityService,
    TenantApiKeyService,
  ],
})
export class WorkforceModule {}
