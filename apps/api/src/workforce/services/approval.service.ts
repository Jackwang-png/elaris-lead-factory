import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { ActorType, WorkforceContext } from '../workforce.types';

/**
 * P0-4.4 Approval 生命周期（事件溯源，复用 AuditLog 表，不新建模型/不迁移 schema）。
 *
 * 状态机：
 *   PENDING_APPROVAL ──approve──> APPROVED ──markExecuting──> EXECUTING ──markExecuted──> EXECUTED
 *        │
 *        ├──reject──> REJECTED
 *        ├──expire──> EXPIRED
 *        └──cancel──> CANCELLED
 *
 * 存储：每个状态迁移写一条 AuditLog 行（resource='Approval'，resourceId=approvalId），
 * detail 携带完整快照（approvalId/action/tenantId/targetType/targetId/riskLevel/status/
 * requestedAt/approvedAt/approvedBy/rejectedAt/rejectedBy/reason/traceId），
 * seq 单调递增保证迁移顺序。当前状态 = 该 approvalId 下 seq 最大的快照。
 *
 * 审计动作：APPROVAL_CREATED / APPROVAL_APPROVED / APPROVAL_REJECTED /
 * APPROVAL_EXPIRED / APPROVAL_CANCELLED / APPROVAL_EXECUTING / APPROVAL_EXECUTED。
 *
 * 安全规则：
 *   - 跨 tenant 访问 → 404（不泄露存在性）
 *   - 重复审批（非 PENDING_APPROVAL 时 approve/reject）→ 409
 *   - EXPIRED / REJECTED / CANCELLED / EXECUTED 为终态，不可再审批 → 409
 *   - reject 必须带 reason → 400
 *   - 过期审批自动标记 EXPIRED 后再操作 → 409
 *
 * traceId 串联：审批记录创建时绑定链路 traceId，后续迁移行的 traceId 沿用
 * 原链路（保持 Signal→Lead→Hunter→Approval→Opportunity 同一 traceId 可查），
 * 操作者本次请求的 traceId 记录在 detail.approverTraceId。
 */

export type ApprovalStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ApprovalSnapshot {
  approvalId: string;
  action: string;
  tenantId: string;
  targetType: string;
  targetId: string;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  reason: string | null;
  traceId: string;
  requestedBy: string | null;
  source: string | null;
  actorType: ActorType | null;
  approverTraceId?: string | null;
  result?: any;
  seq: number;
}

export interface RequestApprovalInput {
  tenantId: string;
  action: string;
  targetType: string;
  targetId: string;
  riskLevel: RiskLevel;
  reason?: string;
  expiresAt?: string | null;
  traceId: string;
  requestedBy?: string;
  source?: string;
  actorType?: ActorType;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger('ApprovalService');

  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
  ) {}

  /** 创建审批（写 APPROVAL_CREATED 审计行） */
  async request(input: RequestApprovalInput): Promise<ApprovalSnapshot> {
    const approvalId = randomUUID();
    const snapshot: ApprovalSnapshot = {
      approvalId,
      action: input.action,
      tenantId: input.tenantId,
      targetType: input.targetType,
      targetId: input.targetId,
      riskLevel: input.riskLevel,
      status: 'PENDING_APPROVAL',
      requestedAt: new Date().toISOString(),
      expiresAt: input.expiresAt || null,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      reason: input.reason || null,
      traceId: input.traceId,
      requestedBy: input.requestedBy || null,
      source: input.source || null,
      actorType: input.actorType || null,
      seq: 0,
    };
    await this.writeTransition(snapshot, 'APPROVAL_CREATED');
    return snapshot;
  }

  /** 审批通过：PENDING_APPROVAL → APPROVED */
  async approve(
    tenantId: string,
    approvalId: string,
    ctx: WorkforceContext,
  ): Promise<ApprovalSnapshot> {
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) throw new NotFoundException('Approval not found');

    if (current.expiresAt && Date.parse(current.expiresAt) < Date.now()) {
      await this.expire(tenantId, approvalId);
      throw new ConflictException('Approval has expired');
    }
    if (current.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Cannot approve approval in status ${current.status}`,
      );
    }

    const next: ApprovalSnapshot = {
      ...current,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      approvedBy: ctx.userId || ctx.source || 'system',
      actorType: ctx.actorType,
      approverTraceId: ctx.traceId,
      seq: current.seq + 1,
    };
    await this.writeTransition(next, 'APPROVAL_APPROVED');
    return next;
  }

  /** 拒绝：PENDING_APPROVAL → REJECTED（reason 必填） */
  async reject(
    tenantId: string,
    approvalId: string,
    reason: string,
    ctx: WorkforceContext,
  ): Promise<ApprovalSnapshot> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('reason is required to reject an approval');
    }
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) throw new NotFoundException('Approval not found');

    if (current.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Cannot reject approval in status ${current.status}`,
      );
    }

    const next: ApprovalSnapshot = {
      ...current,
      status: 'REJECTED',
      rejectedAt: new Date().toISOString(),
      rejectedBy: ctx.userId || ctx.source || 'system',
      reason: reason.trim(),
      actorType: ctx.actorType,
      approverTraceId: ctx.traceId,
      seq: current.seq + 1,
    };
    await this.writeTransition(next, 'APPROVAL_REJECTED');
    return next;
  }

  /** 开始执行：APPROVED → EXECUTING（执行引擎调用） */
  async markExecuting(
    tenantId: string,
    approvalId: string,
    ctx: WorkforceContext,
  ): Promise<ApprovalSnapshot> {
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) throw new NotFoundException('Approval not found');
    if (current.status !== 'APPROVED') {
      throw new ConflictException(
        `Cannot mark executing approval in status ${current.status}`,
      );
    }
    const next: ApprovalSnapshot = {
      ...current,
      status: 'EXECUTING',
      actorType: ctx.actorType,
      approverTraceId: ctx.traceId,
      seq: current.seq + 1,
    };
    await this.writeTransition(next, 'APPROVAL_EXECUTING');
    return next;
  }

  /** 执行完成：EXECUTING/APPROVED → EXECUTED */
  async markExecuted(
    tenantId: string,
    approvalId: string,
    ctx: WorkforceContext,
    result?: any,
  ): Promise<ApprovalSnapshot> {
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) throw new NotFoundException('Approval not found');
    if (current.status !== 'EXECUTING' && current.status !== 'APPROVED') {
      throw new ConflictException(
        `Cannot mark executed approval in status ${current.status}`,
      );
    }
    const next: ApprovalSnapshot = {
      ...current,
      status: 'EXECUTED',
      result: result ?? null,
      actorType: ctx.actorType,
      approverTraceId: ctx.traceId,
      seq: current.seq + 1,
    };
    await this.writeTransition(next, 'APPROVAL_EXECUTED');
    return next;
  }

  /** 过期：PENDING_APPROVAL → EXPIRED（approve 前置自动触发，也可定时任务调用） */
  async expire(tenantId: string, approvalId: string): Promise<ApprovalSnapshot | null> {
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) return null;
    if (current.status !== 'PENDING_APPROVAL') return current;
    const next: ApprovalSnapshot = {
      ...current,
      status: 'EXPIRED',
      reason: current.reason || 'approval expired',
      actorType: 'SYSTEM',
      seq: current.seq + 1,
    };
    await this.writeTransition(next, 'APPROVAL_EXPIRED');
    return next;
  }

  /** 取消：PENDING_APPROVAL → CANCELLED */
  async cancel(
    tenantId: string,
    approvalId: string,
    ctx: WorkforceContext,
    reason?: string,
  ): Promise<ApprovalSnapshot> {
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) throw new NotFoundException('Approval not found');
    if (current.status !== 'PENDING_APPROVAL') {
      throw new ConflictException(
        `Cannot cancel approval in status ${current.status}`,
      );
    }
    const next: ApprovalSnapshot = {
      ...current,
      status: 'CANCELLED',
      reason: reason || current.reason || 'cancelled',
      actorType: ctx.actorType,
      approverTraceId: ctx.traceId,
      seq: current.seq + 1,
    };
    await this.writeTransition(next, 'APPROVAL_CANCELLED');
    return next;
  }

  /** 读取单个审批当前状态（跨 tenant → 404） */
  async getById(tenantId: string, approvalId: string): Promise<ApprovalSnapshot> {
    const current = await this.getCurrent(tenantId, approvalId);
    if (!current) throw new NotFoundException('Approval not found');
    return current;
  }

  /** 审批列表（status/action/riskLevel 筛选 + 分页） */
  async list(
    tenantId: string,
    query: {
      status?: string;
      action?: string;
      riskLevel?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    items: ApprovalSnapshot[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Number(query.page) || 1;
    const limit = Math.min(Number(query.limit) || 20, 100);

    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, resource: 'Approval' },
      orderBy: { createdAt: 'desc' },
      take: 5000, // 生产 v2 低量；超出部分属扩展风险（见交付报告 Remaining risks）
    });

    // 按 approvalId 分组，取 seq 最大（最新）快照
    const byId = new Map<string, ApprovalSnapshot>();
    for (const row of rows) {
      const snap = (row.detail || {}) as unknown as ApprovalSnapshot;
      if (!snap.approvalId) continue;
      const prev = byId.get(snap.approvalId);
      if (!prev || (snap.seq ?? 0) > (prev.seq ?? 0)) {
        byId.set(snap.approvalId, snap);
      }
    }

    let items = Array.from(byId.values());
    if (query.status) {
      items = items.filter((i) => i.status === query.status);
    }
    if (query.action) {
      items = items.filter((i) => i.action === query.action);
    }
    if (query.riskLevel) {
      items = items.filter((i) => i.riskLevel === query.riskLevel);
    }
    items.sort(
      (a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt),
    );

    const total = items.length;
    const start = (page - 1) * limit;
    return {
      items: items.slice(start, start + limit),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** 供执行引擎/定时任务：把 tenant 内所有已过期未处理审批标记 EXPIRED */
  async expireAllExpired(tenantId: string): Promise<number> {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, resource: 'Approval' },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const byId = new Map<string, ApprovalSnapshot>();
    for (const row of rows) {
      const snap = (row.detail || {}) as unknown as ApprovalSnapshot;
      if (!snap.approvalId) continue;
      const prev = byId.get(snap.approvalId);
      if (!prev || (snap.seq ?? 0) > (prev.seq ?? 0)) {
        byId.set(snap.approvalId, snap);
      }
    }
    let expired = 0;
    for (const snap of byId.values()) {
      if (
        snap.status === 'PENDING_APPROVAL' &&
        snap.expiresAt &&
        Date.parse(snap.expiresAt) < Date.now()
      ) {
        await this.expire(tenantId, snap.approvalId);
        expired++;
      }
    }
    return expired;
  }

  // -------------------------------------------------------------------------
  // internal
  // -------------------------------------------------------------------------

  private async getCurrent(
    tenantId: string,
    approvalId: string,
  ): Promise<ApprovalSnapshot | null> {
    const rows = await this.prisma.auditLog.findMany({
      where: { tenantId, resource: 'Approval', resourceId: approvalId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    if (!rows.length) return null;
    let best: ApprovalSnapshot | null = null;
    for (const row of rows) {
      const snap = (row.detail || {}) as unknown as ApprovalSnapshot;
      if (!best || (snap.seq ?? 0) > (best.seq ?? 0)) best = snap;
    }
    return best;
  }

  /** 写一条迁移审计行：action=APPROVAL_*，detail=完整快照，traceId=原链路 */
  private async writeTransition(
    snapshot: ApprovalSnapshot,
    action: string,
  ): Promise<void> {
    // traceId 沿用审批链路（同一 traceId 串联 Signal→…→Approval→Opportunity），
    // 操作者请求的 traceId 已在 snapshot.approverTraceId。
    await this.audit.log({
      action,
      resource: 'Approval',
      resourceId: snapshot.approvalId,
      tenantId: snapshot.tenantId,
      userId: snapshot.approvedBy || snapshot.rejectedBy || undefined,
      detail: { ...snapshot },
      actorType: snapshot.actorType || 'SYSTEM',
      source: snapshot.source || 'approval',
      traceId: snapshot.traceId,
    });
  }
}
