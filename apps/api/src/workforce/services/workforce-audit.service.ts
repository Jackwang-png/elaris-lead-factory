import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActorType } from '../workforce.types';

export interface WorkforceAuditParams {
  action: string;
  resource: string;
  resourceId?: string;
  tenantId: string;
  userId?: string;
  detail?: any;
  success?: boolean;
  failureReason?: string;
  ip?: string;
  userAgent?: string;
  actorType?: ActorType;
  source?: string;
  traceId?: string;
}

/**
 * P0-3 Workforce 审计服务（v2 扩展）。
 *
 * 相比 v1 AuditService 增加 actorType(USER/AI_EMPLOYEE/SERVICE/SYSTEM) /
 * source / traceId 三个字段，供 Scout / Hunter / 外部服务全链路审计。
 * 写入失败不阻断主流程（try-catch 包裹，与 v1 一致）。
 */
@Injectable()
export class WorkforceAuditService {
  private readonly logger = new Logger('WorkforceAuditService');

  constructor(private prisma: PrismaService) {}

  async log(params: WorkforceAuditParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          tenantId: params.tenantId,
          userId: params.userId || null,
          detail: params.detail ?? null,
          success: params.success ?? true,
          failureReason: params.failureReason || null,
          ip: params.ip || null,
          userAgent: params.userAgent || null,
          actorType: params.actorType ?? 'SERVICE',
          source: params.source || null,
          traceId: params.traceId || null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Workforce 审计写入失败: action=${params.action}, error=${(error as Error).message}`,
      );
    }
  }

  /** 分页查询（tenantId 强制过滤，支持 actorType/source/traceId 筛选） */
  async query(params: {
    tenantId: string;
    page?: number;
    limit?: number;
    action?: string;
    resource?: string;
    actorType?: string;
    source?: string;
    traceId?: string;
    success?: string;
    from?: string;
    to?: string;
    search?: string;
  }) {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const {
      tenantId,
      action,
      resource,
      actorType,
      source,
      traceId,
      success,
      from,
      to,
      search,
    } = params;
    const skip = (page - 1) * limit;
    const where: any = { tenantId };

    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (actorType) where.actorType = actorType;
    if (source) where.source = source;
    if (traceId) where.traceId = traceId;
    if (success !== undefined && success !== '') {
      where.success = success === 'true' || success === '1';
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
        { resourceId: { contains: search, mode: 'insensitive' } },
        { traceId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
