import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApprovalService } from '../services/approval.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import {
  QueryApprovalsDto,
  ApproveApprovalDto,
  RejectApprovalDto,
} from '../dto/approval.dto';
import { WorkforceContext } from '../workforce.types';

/**
 * P0-4.4 Human Approval 生命周期 API。
 *
 *   GET  /api/v2/approvals            —— 列表（status/action/riskLevel 筛选 + 分页）
 *   POST /api/v2/approvals/:id/approve —— 审批通过（PENDING_APPROVAL → APPROVED）
 *   POST /api/v2/approvals/:id/reject  —— 拒绝（必须 reason；→ REJECTED）
 *
 * 安全：
 *   - 跨 tenant 操作 → 404（不泄露存在性）
 *   - 重复审批 / 终态审批 → 409
 *   - reject 无 reason → 400
 *   - 审批通过/拒绝均写 AuditLog（APPROVAL_APPROVED / APPROVAL_REJECTED，
 *     含 tenantId/actorType/source/traceId）
 *
 * 权限：JWT 用户全量（scopes=['*']）；API Key 需 approvals:read / approvals:write。
 * EXECUTING/EXECUTED/EXPIRED/CANCELLED 由执行引擎/服务内部调用（不开放 HTTP）。
 */
@ApiTags('Workforce v2 · Approvals')
@Controller('api/v2/approvals')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class ApprovalsController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Get()
  @RequireScope('approvals:read')
  @ApiOperation({ summary: '审批列表（status/action/riskLevel 筛选）' })
  async list(
    @Query() query: QueryApprovalsDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.approvalService.list(ctx.tenantId, query as any);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequireScope('approvals:write')
  @ApiOperation({ summary: '审批通过（PENDING_APPROVAL → APPROVED）' })
  async approve(
    @Param('id') id: string,
    @Body() _dto: ApproveApprovalDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.approvalService.approve(ctx.tenantId, id, ctx);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequireScope('approvals:write')
  @ApiOperation({ summary: '拒绝审批（必须 reason；→ REJECTED）' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectApprovalDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.approvalService.reject(ctx.tenantId, id, dto.reason, ctx);
  }
}
