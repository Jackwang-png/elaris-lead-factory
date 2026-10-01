import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { HunterDiscoverDto } from './dto/hunter-discovery.dto';
import { HunterPipelineService } from './hunter-pipeline.service';
import { WorkforceTenant, RequireScope } from '../workforce/workforce.decorators';
import { WorkforceTenantGuard } from '../workforce/workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce/workforce-throttler.guard';
import { WorkforceContext } from '../workforce/workforce.types';

/**
 * Controller responsibilities are limited to: auth / tenant / DTO / delegation.
 * All Hunter judgement lives in HunterPipelineService.
 */
@ApiTags('Workforce v2 路 Hunter')
@Controller('api/v2/hunter')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class HunterDiscoveryController {
  constructor(private readonly pipeline: HunterPipelineService) {}

  @Post('discover')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequireScope('hunter:write', 'service:hunter')
  @ApiOperation({ summary: 'Hunter discovery closed loop (discover -> qualify -> assess -> persist)' })
  async discover(@Body() dto: HunterDiscoverDto, @WorkforceTenant() ctx: WorkforceContext) {
    const items = await this.pipeline.run(ctx.tenantId, {
      query: dto.query,
      urls: dto.urls,
      limit: dto.limit,
      country: dto.country,
      region: dto.region,
      industry: dto.industry,
    });
    return { tenantId: ctx.tenantId, traceId: ctx.traceId, count: items.length, items };
  }
}
