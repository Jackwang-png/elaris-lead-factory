import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantApiKeyService } from '../services/tenant-api-key.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, JwtOnly } from '../workforce.decorators';
import { ApiKeyLifecycleDto } from '../dto/api-key.dto';
import { WorkforceContext } from '../workforce.types';

/**
 * P0-4.1 TenantApiKey 生命周期管理。
 *
 * 说明：创建仍走 /api/v2/tenants/api-keys（P0-3 兼容，明文只返回一次）。
 * 本控制器提供：
 *   GET  /api/v2/api-keys           —— 列表（只暴露 id/prefix/scopes/active/…，绝不返回 raw key/keyHash）
 *   POST /api/v2/api-keys/:id/revoke   —— 撤销（active=false，X-Tenant-Key 立即失效）
 *   POST /api/v2/api-keys/:id/activate —— 重新激活（仅非 active 状态可激活）
 *
 * 安全：JWT-only（平台用户管理）；Key Ownership —— 只能操作自己 tenant 的 key
 * （findFirst({ id, tenantId })），跨 tenant 一律 404。
 * 审计：API_KEY_REVOKED / API_KEY_ACTIVATED（含 tenantId/actorType/source/traceId）。
 */
@ApiTags('Workforce v2 · API Keys (lifecycle)')
@Controller('api/v2/api-keys')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
@JwtOnly()
export class ApiKeysController {
  constructor(private readonly apiKeyService: TenantApiKeyService) {}

  /** 列表：只返回 id/prefix/scopes/active/expiresAt/createdAt/lastUsedAt，禁止 raw key/keyHash */
  @Get()
  @ApiOperation({ summary: 'API Key 列表（仅前缀与状态，不含明文/hash）' })
  async list(@WorkforceTenant() ctx: WorkforceContext) {
    return this.apiKeyService.listSafe(ctx.tenantId);
  }

  /** 撤销：status → revoked，X-Tenant-Key 立即失效 */
  @Post(':id/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: '撤销 API Key（立即失效）' })
  async revoke(
    @Param('id') id: string,
    @Body() dto: ApiKeyLifecycleDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.apiKeyService.revoke(ctx.tenantId, id, ctx, dto?.reason);
  }

  /** 重新激活：revoked → active（过期 key 激活后仍需 expiresAt 未过才可用） */
  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({ summary: '重新激活 API Key' })
  async activate(
    @Param('id') id: string,
    @Body() dto: ApiKeyLifecycleDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.apiKeyService.activate(ctx.tenantId, id, ctx, dto?.reason);
  }
}
