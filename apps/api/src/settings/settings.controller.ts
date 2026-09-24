import { Controller, Get, Put, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Settings 系统设置')
@Controller('settings')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: '获取当前租户的系统设置' })
  async getSettings(@Req() req) {
    return this.settingsService.getSettings(req.tenantId);
  }

  @Put()
  @ApiOperation({ summary: '更新系统设置' })
  async updateSettings(@Req() req, @Body() body: Record<string, any>) {
    return this.settingsService.updateSettings(req.tenantId, body);
  }
}
