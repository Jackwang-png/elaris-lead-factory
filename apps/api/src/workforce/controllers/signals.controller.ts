import { Controller, Get, Post, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SignalService } from '../services/signal.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import { CreateSignalDto, QuerySignalsDto } from '../dto/signal.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Intelligence Signals (Scout)')
@Controller('api/v2/intelligence-signals')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class SignalsController {
  constructor(private readonly signalService: SignalService) {}

  /** Scout 上报信号：验 evidenceHash 去重 → Entity Resolution → 自动建 Lead */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequireScope('signals:write', 'service:scout')
  @ApiOperation({ summary: 'Scout 上报情报信号（自动去重 + 建 Company/Lead）' })
  async create(
    @Body() dto: CreateSignalDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.signalService.create(ctx.tenantId, dto, ctx);
  }

  @Get()
  @RequireScope('signals:read', 'service:scout')
  @ApiOperation({ summary: '信号列表（tenantId 过滤 + 筛选 + 分页）' })
  async list(
    @Query() query: QuerySignalsDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.signalService.list(ctx.tenantId, query as any);
  }
}
