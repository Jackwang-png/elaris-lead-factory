import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LeadService } from '../services/lead.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import {
  CreateLeadDto,
  QueryLeadsDto,
  UpdateLeadStatusDto,
  HunterQueueDto,
} from '../dto/lead.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Leads')
@Controller('api/v2/leads')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private readonly leadService: LeadService) {}

  /** B2B 传 companyId；B2C 传 contactId（=customerId）。至少一个必填（双空 400）。 */
  @Post()
  @HttpCode(201)
  @RequireScope('leads:write', 'service:scout', 'service:hunter')
  @ApiOperation({ summary: '创建 Lead（B2B: companyId / B2C: contactId，至少一个）' })
  async create(
    @Body() dto: CreateLeadDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadService.create(ctx.tenantId, dto, ctx);
  }

  @Get()
  @RequireScope('leads:read')
  @ApiOperation({ summary: 'Lead 列表（含 signal/opportunity 关联）' })
  async list(
    @Query() query: QueryLeadsDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadService.list(ctx.tenantId, query as any);
  }

  @Get(':id')
  @RequireScope('leads:read')
  @ApiOperation({ summary: 'Lead 详情（含 signal/company/conversation/opportunities）' })
  async getById(
    @Param('id') id: string,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadService.getById(ctx.tenantId, id);
  }

  /** 状态推进：new→qualified→handoff→won/lost */
  @Patch(':id/status')
  @RequireScope('leads:write')
  @ApiOperation({ summary: 'Lead 状态推进（qualified 时记录 qualifiedBy/qualifiedAt）' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadService.updateStatus(ctx.tenantId, id, dto.status, ctx, dto.reason);
  }

  /** Lead 进入 Hunter 队列（Human Control：默认需人工确认） */
  @Post(':id/hunter-queue')
  @HttpCode(202)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequireScope('leads:write', 'service:hunter')
  @ApiOperation({ summary: 'Lead 进入 Hunter 队列（默认 PENDING_APPROVAL）' })
  async enqueueHunter(
    @Param('id') id: string,
    @Body() dto: HunterQueueDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.leadService.enqueueHunter(ctx.tenantId, id, ctx, dto);
  }
}
