import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StaffService } from './staff.service';
import { CreateStaffDto, SetStaffActiveDto } from './staff.dto';

/**
 * 商家员工系统（GROWTH-STAFF-06）。
 * 仅 OWNER（role=merchant）可操作：平台 admin 与 CUSTOMER_SERVICE 均被 RolesGuard 拒绝。
 * tenantId 一律来自 JWT（TenantGuard → req.tenantId），禁止客户端决定归属租户。
 */
@ApiTagsLocal()
@Controller('staff')
@UseGuards(JwtAuthGuard, TenantGuard, new RolesGuard(['merchant']))
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list(@Req() req) {
    return this.staffService.listStaff(req.tenantId);
  }

  @Post()
  async create(@Body() dto: CreateStaffDto, @Req() req) {
    return this.staffService.createStaff(req.tenantId, req.user.id, dto);
  }

  @Post(':id/disable')
  async disable(@Param('id') id: string, @Body() body: SetStaffActiveDto, @Req() req) {
    const active = body?.active === true;
    return this.staffService.setStaffActive(req.tenantId, req.user.id, id, active);
  }
}

// 轻量装饰器：避免引入 @nestjs/swagger 依赖耦合（与现有 controller 风格一致，可选）
function ApiTagsLocal() {
  return (_t: any, _k?: string, _d?: any) => {};
}
