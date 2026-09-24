import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@Controller('usage')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('daily')
  async daily(@Req() req) {
    return this.usageService.getDailyUsage(req.tenantId);
  }

  @Get('stats')
  async stats(@Req() req) {
    return this.usageService.getMonthlyUsage(req.tenantId);
  }
}
