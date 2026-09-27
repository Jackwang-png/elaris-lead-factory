import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LeadIntelligenceModule } from '../lead-intelligence/lead-intelligence.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { InviteCodesController } from './invite-codes.controller';
import { InviteCodesService } from './invite-codes.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { AdminAgentController } from './admin-agent.controller';
import { AdminAgentService } from './admin-agent.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuditModule, KnowledgeModule, LeadIntelligenceModule],
  controllers: [AdminController, InviteCodesController, MaintenanceController, AdminAgentController],
  providers: [AdminService, InviteCodesService, MaintenanceService, AdminAgentService],
  exports: [AdminService, InviteCodesService],
})
export class AdminModule {}
