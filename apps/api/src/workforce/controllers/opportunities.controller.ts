import { Controller, Get, Post, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OpportunityService } from '../services/opportunity.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import { CreateOpportunityDto, QueryOpportunitiesDto } from '../dto/hunter.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Opportunities')
@Controller('api/v2/opportunities')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class OpportunitiesController {
  constructor(private readonly opportunityService: OpportunityService) {}

  /** 从 Qualified Lead 创建商机 */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequireScope('opportunities:write', 'service:hunter')
  @ApiOperation({ summary: '从 Qualified Lead 创建商机' })
  async create(
    @Body() dto: CreateOpportunityDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.opportunityService.create(ctx.tenantId, dto, ctx);
  }

  @Get()
  @RequireScope('opportunities:read')
  @ApiOperation({ summary: '商机列表' })
  async list(
    @Query() query: QueryOpportunitiesDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.opportunityService.list(ctx.tenantId, query as any);
  }
}
