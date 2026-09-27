import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceDto } from './maintenance.dto';

@ApiTags('Admin 运维自修复')
@Controller('admin/maintenance')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class MaintenanceController {
  constructor(private readonly svc: MaintenanceService) {}

  @Post()
  @ApiOperation({ summary: '执行白名单内运维操作（诊断→校验→执行→验证→审计）' })
  async exec(@Body() dto: MaintenanceDto, @CurrentUser() user: User, @Req() req: any) {
    return this.svc.execute(dto.action, dto.tenantId, user.id, {
      targetId: dto.targetId,
      reason: dto.reason,
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  }
}
