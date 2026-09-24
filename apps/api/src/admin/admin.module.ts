import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { InviteCodesController } from './invite-codes.controller';
import { InviteCodesService } from './invite-codes.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuditModule],
  controllers: [AdminController, InviteCodesController],
  providers: [AdminService, InviteCodesService],
  exports: [AdminService, InviteCodesService],
})
export class AdminModule {}
