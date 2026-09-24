import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryAuditDto } from './dto/query-audit.dto';

/**
 * 审计日志服务
 *
 * 用途：记录系统关键操作，支持查询与筛选。
 * 日志写入失败不阻断主业务流程（try-catch 包裹）。
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 记录一条审计日志
   *
   * @param params.action 操作类型（如 USER_LOGIN, ORDER_PAID）
   * @param params.resource 资源类型（如 User, PaymentOrder）
   * @param params.resourceId 资源 ID
   * @param params.tenantId 租户 ID
   * @param params.userId 操作人 ID（可为空，系统/Webhook 操作）
   * @param params.detail 详情（JSON，如变更前后数据）
   * @param params.success 是否成功
   * @param params.failureReason 失败原因
   * @param params.ip 操作 IP
   * @param params.userAgent 浏览器信息
   */
  async log(params: {
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
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          tenantId: params.tenantId,
          userId: params.userId || null,
          detail: params.detail || null,
          success: params.success ?? true,
          failureReason: params.failureReason || null,
          ip: params.ip || null,
          userAgent: params.userAgent || null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `审计日志写入失败: action=${params.action}, error=${error.message}`,
      );
    }
  }

  /**
   * 分页查询审计日志
   */
  async query(params: QueryAuditDto & { tenantId: string }) {
    const { page = 1, limit = 20, action, resource, userId, search, success, from, to, tenantId } =
      params;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (action) where.action = action;
    if (resource) where.resource = resource;
    if (userId) where.userId = userId;
    if (success !== undefined) where.success = success;

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
        { detail: { path: '$', contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
