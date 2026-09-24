import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Dashboard 工作台')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: '工作台首页统计' })
  async stats(@Req() req) {
    return this.dashboardService.getStats(req.tenantId);
  }

  @Get('conversion-data')
  @ApiOperation({ summary: '转化漏斗数据' })
  async conversionData(@Req() req) {
    return this.dashboardService.getConversionData(req.tenantId);
  }

  @Get('conversation-data')
  @ApiOperation({ summary: '最近7天对话趋势' })
  async conversationData(@Req() req) {
    return this.dashboardService.getConversationData(req.tenantId);
  }

  @Get('lead-sources')
  @ApiOperation({ summary: '线索来源分布' })
  async leadSources(@Req() req) {
    return this.dashboardService.getLeadSources(req.tenantId);
  }

  @Get('agents/status')
  @ApiOperation({ summary: '代理/机器人运行状态' })
  async agentStatus(@Req() req) {
    return this.dashboardService.getAgentStatus(req.tenantId);
  }
}
