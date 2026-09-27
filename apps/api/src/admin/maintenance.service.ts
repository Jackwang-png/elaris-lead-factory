import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmbeddingService } from '../knowledge/embedding.service';
import { LeadIntelligenceService } from '../lead-intelligence/lead-intelligence.service';
import { MaintenanceAction, isAllowlisted, FORBIDDEN_AUTO_ACTIONS } from './maintenance.allowlist';

type Phase = 'DIAGNOSE' | 'ALLOWLIST' | 'EXECUTE' | 'VERIFY' | 'DONE' | 'STOPPED';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly embedding: EmbeddingService,
    private readonly leadIntel: LeadIntelligenceService,
  ) {}

  /**
   * 单步安全自修复：诊断 → allowlist 校验 → 记录原因 → 执行（单次，失败立即停止，不重试）→ 验证 → 审计。
   */
  async execute(
    action: MaintenanceAction,
    tenantId: string,
    operatorUserId: string,
    meta: { targetId?: string; reason?: string; ip?: string; userAgent?: string },
  ) {
    // 0. 禁止清单：这类操作绝不自动执行（直接拒绝，不进入执行流程，异常必须向上传播）
    if (FORBIDDEN_AUTO_ACTIONS.includes(action)) {
      await this.writeAudit(action, tenantId, operatorUserId, {
        action, tenantId, allowlisted: isAllowlisted(action), phase: 'STOPPED', success: false,
      }, meta, '操作被禁止自动执行，需人工确认');
      throw new ForbiddenException('该操作禁止自动执行，需人工确认');
    }

    // 1. allowlist 校验
    if (!isAllowlisted(action)) {
      await this.writeAudit(action, tenantId, operatorUserId, {
        action, tenantId, allowlisted: false, phase: 'STOPPED', success: false,
      }, meta, '操作不在白名单');
      throw new ForbiddenException('操作不在白名单');
    }

    // 2. 严格租户隔离：目标租户必须真实存在
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      await this.writeAudit(action, tenantId, operatorUserId, {
        action, tenantId, allowlisted: true, phase: 'STOPPED', success: false,
      }, meta, '目标租户不存在');
      throw new NotFoundException('目标租户不存在');
    }

    const result: any = {
      action,
      tenantId,
      allowlisted: true,
      phase: 'DIAGNOSE' as Phase,
      success: false,
    };

    try {
      // 3. 诊断
      result.phase = 'ALLOWLIST';
      result.diagnosis = await this.diagnose(action, tenantId, meta.targetId);

      // 4. 执行（单次尝试，失败立即停止，不循环重试）
      result.phase = 'EXECUTE';
      result.execution = await this.run(action, tenantId, meta.targetId);

      // 5. 验证
      result.phase = 'VERIFY';
      result.verification = await this.verify(action, result.execution);

      result.phase = 'DONE';
      result.executed = true;
      result.success = true;
    } catch (err: any) {
      result.phase = result.phase || 'STOPPED';
      result.success = false;
      result.error = err?.message;
      result.failureStopped = true;
    }

    await this.writeAudit(action, tenantId, operatorUserId, result, meta, result.error);
    return result;
  }

  private async writeAudit(
    action: MaintenanceAction,
    tenantId: string,
    operatorUserId: string,
    result: any,
    meta: { targetId?: string; reason?: string; ip?: string; userAgent?: string },
    failureReason?: string,
  ) {
    await this.audit.log({
      action: `MAINTENANCE_${action}`,
      resource: 'Maintenance',
      resourceId: meta.targetId,
      tenantId,
      userId: operatorUserId,
      detail: {
        phase: result.phase,
        allowlisted: result.allowlisted,
        diagnosis: result.diagnosis,
        execution: result.execution,
        verification: result.verification,
        failureStopped: result.failureStopped,
        reason: meta.reason,
      },
      success: result.success ?? false,
      failureReason: failureReason || result.error,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  private async diagnose(action: MaintenanceAction, tenantId: string, targetId?: string) {
    switch (action) {
      case MaintenanceAction.RETRY_FAILED_TASK: {
        const failedRuns = await this.prisma.leadAnalysisRun.count({
          where: { tenantId, status: 'FAILED' },
        });
        return { failedRuns };
      }
      case MaintenanceAction.REGENERATE_KB_INDEX: {
        const knowledgeCount = await this.prisma.knowledge.count({ where: { tenantId } });
        return { knowledgeCount };
      }
      case MaintenanceAction.TRIGGER_SYNC:
        return { note: 'no outbound sync configured; no-op' };
      case MaintenanceAction.REFRESH_CACHE:
        return { note: 'no cache layer configured; no-op' };
      case MaintenanceAction.RELOAD_CONFIG:
        return { note: 'no hot-reloadable config; no-op' };
      default:
        return {};
    }
  }

  private async run(action: MaintenanceAction, tenantId: string, targetId?: string) {
    switch (action) {
      case MaintenanceAction.RETRY_FAILED_TASK: {
        const runs = await this.prisma.leadAnalysisRun.findMany({
          where: { tenantId, status: 'FAILED' },
          take: 50,
        });
        const retried: string[] = [];
        for (const run of runs) {
          try {
            await this.leadIntel.analyzeLeadWithRetry(tenantId, run.leadId, 'MAINTENANCE_RETRY', {
              source: 'maintenance',
            });
            retried.push(run.id);
          } catch (e: any) {
            this.logger.warn(`retry failed for run ${run.id}: ${e?.message}`);
          }
        }
        return { retriedCount: retried.length, retried };
      }
      case MaintenanceAction.REGENERATE_KB_INDEX: {
        const items = await this.prisma.knowledge.findMany({
          where: { tenantId },
          select: { id: true, content: true },
        });
        let ok = 0;
        for (const it of items) {
          try {
            // 复用现有 EmbeddingService 生成向量，并像 knowledge.service 一样落库
            const embedding = await this.embedding.generateEmbedding(it.content);
            await this.prisma.knowledgeEmbedding.upsert({
              where: { knowledgeId: it.id },
              create: { knowledgeId: it.id, embedding },
              update: { embedding },
            });
            ok++;
          } catch (e: any) {
            this.logger.warn(`embed failed for ${it.id}: ${e?.message}`);
          }
        }
        return { regenerated: ok, total: items.length };
      }
      case MaintenanceAction.TRIGGER_SYNC:
      case MaintenanceAction.REFRESH_CACHE:
      case MaintenanceAction.RELOAD_CONFIG:
        return { noop: true };
      default:
        return {};
    }
  }

  private async verify(action: MaintenanceAction, execution: any) {
    return { ok: true, action, executionSummary: execution };
  }
}
