import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalService } from './services/approval.service';

/**
 * P0-5A Approval 过期清扫器。
 *
 * - 复用 P0-4 ApprovalService.expireAllExpired（已实现 PENDING→EXPIRED + AuditLog）。
 * - 每 5 分钟扫描所有出现过 Approval 审计行的 tenant（tenant-safe：逐 tenant 调用，
 *   内部按 tenantId 过滤），只迁移 PENDING_APPROVAL 且 expiresAt 已过期的审批。
 * - 幂等：expire() 仅对 PENDING_APPROVAL 生效并写一条 APPROVAL_EXPIRED 审计行；
 *   重复扫描不会重复写。不影响 APPROVED / EXECUTING / 终态。
 * - 不使用 Redis/BullMQ：@nestjs/schedule 进程内 cron，单实例部署即可（多实例需加锁/Redis）。
 */
@Injectable()
export class ApprovalExpirationService {
  private readonly logger = new Logger(ApprovalExpirationService.name);

  constructor(
    private prisma: PrismaService,
    private approval: ApprovalService,
  ) {}

  // 每 5 分钟扫描一次（cron: star-slash-5 * * * *）
  @Cron('*/5 * * * *')
  async sweepExpiredApprovals(): Promise<number> {
    let tenants: Array<{ tenantId: string }> = [];
    try {
      tenants = await this.prisma.auditLog.findMany({
        where: { resource: 'Approval' },
        select: { tenantId: true },
        distinct: ['tenantId'],
        take: 500,
      });
    } catch (e) {
      this.logger.error(`approval sweep: cannot list tenants: ${(e as Error).message}`);
      return 0;
    }

    let total = 0;
    for (const row of tenants) {
      try {
        const n = await this.approval.expireAllExpired(row.tenantId);
        total += n;
        if (n > 0) {
          this.logger.log(`approval sweep: tenant ${row.tenantId} expired ${n} approval(s)`);
        }
      } catch (e) {
        this.logger.error(
          `approval sweep: tenant ${row.tenantId} failed: ${(e as Error).message}`,
        );
      }
    }
    if (total > 0) {
      this.logger.log(`approval sweep: total ${total} expired approval(s)`);
    }
    return total;
  }
}
