import { Controller, Get, Query, Param, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';

@ApiTags('Admin 平台管理')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: '平台统计' })
  stats() {
    return this.adminService.platformStats();
  }

  @Get('tenants')
  @ApiOperation({ summary: '租户（商家）列表' })
  tenants(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
  ) {
    return this.adminService.listTenants(parseInt(page), parseInt(limit), search);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: '租户详情' })
  tenantDetail(@Param('id') id: string) {
    return this.adminService.tenantDetail(id);
  }

  @Get('users')
  @ApiOperation({ summary: '用户列表' })
  users(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search = '',
  ) {
    return this.adminService.listUsers(parseInt(page), parseInt(limit), search);
  }

  @Post('users/:id/role')
  @ApiOperation({ summary: '设置用户角色' })
  setRole(@Param('id') id: string, @Body() body: { role: string }) {
    return this.adminService.setUserRole(id, body.role);
  }
}
