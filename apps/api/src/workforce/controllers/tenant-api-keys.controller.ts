import { Controller, Get, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TenantApiKeyService } from '../services/tenant-api-key.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, JwtOnly, RequireScope } from '../workforce.decorators';
import { CreateApiKeyDto } from '../dto/hunter.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Tenant API Keys')
@Controller('api/v2/tenants/api-keys')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
@JwtOnly()
export class TenantApiKeysController {
  constructor(private readonly apiKeyService: TenantApiKeyService) {}

  /** 生成 TenantApiKey：keyPrefix + keyHash 落库，明文只返回一次 */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '创建 TenantApiKey（明文仅返回一次）' })
  async create(
    @Body() dto: CreateApiKeyDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.apiKeyService.create(ctx.tenantId, dto, ctx);
  }

  @Get()
  @RequireScope('audit:read')
  @ApiOperation({ summary: 'TenantApiKey 列表（仅前缀，不含明文）' })
  async list(@WorkforceTenant() ctx: WorkforceContext) {
    return this.apiKeyService.list(ctx.tenantId);
  }
}
