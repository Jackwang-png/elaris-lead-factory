import { Controller, Get, Post, Body, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { WorkforceAuditService } from '../services/workforce-audit.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import { CreateAuditDto, QueryAuditV2Dto } from '../dto/audit.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Audit')
@Controller('api/v2/audit')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: WorkforceAuditService) {}

  /** 统一审计写入（三系统共用，actorType 校验 USER/AI_EMPLOYEE/SERVICE/SYSTEM） */
  @Post()
  @HttpCode(201)
  @RequireScope('audit:write')
  @ApiOperation({ summary: '统一审计写入（三系统共用）' })
  async create(
    @Body() dto: CreateAuditDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    await this.auditService.log({
      action: dto.action,
      resource: dto.resource,
      resourceId: dto.resourceId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      detail: dto.detail,
      success: dto.success,
      actorType: (dto.actorType as any) || ctx.actorType,
      source: dto.source || ctx.source,
      traceId: dto.traceId || ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return { ok: true, traceId: dto.traceId || ctx.traceId };
  }

  /** 全链路审计查询（tenantId 强制过滤；放宽到 120 req/min/tenant） */
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @RequireScope('audit:read')
  @ApiOperation({ summary: '审计查询（actorType/source/traceId 筛选）' })
  async list(
    @Query() query: QueryAuditV2Dto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.auditService.query({ ...query, tenantId: ctx.tenantId } as any);
  }
}
