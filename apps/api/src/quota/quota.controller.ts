import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { AiQuotaService } from './ai-quota.service';

/**
 * GET /me/quota
 *
 * tenantId 必须来自 JWT（TenantGuard 注入 req.tenantId），绝不接受客户端传入，
 * 防止越权读取其他租户额度。
 */
@ApiTags('Quota')
@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class QuotaController {
  constructor(private readonly aiQuotaService: AiQuotaService) {}

  @Get('quota')
  @ApiOperation({ summary: '当前租户 AI 消息额度状态' })
  async getQuota(@Req() req) {
    return this.aiQuotaService.getQuotaState(req.tenantId);
  }
}
