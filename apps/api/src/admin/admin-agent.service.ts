import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from './admin.service';
import { MaintenanceService } from './maintenance.service';
import { AdminAgentAskDto } from './admin-agent-ask.dto';

type AgentType = 'A' | 'B' | 'C';

/**
 * 管理员内置 Agent 助手。
 * 严格区分三类响应：
 *  - A 信息回答：只读聚合系统数据，零写操作；
 *  - B 建议操作：仅返回操作预案，绝不执行；
 *  - C 真正执行：仅当 confirm=true 且操作命中 allowlist，经 MaintenanceService 执行并写审计。
 * 不做成无限权限超级管理员。
 */
@Injectable()
export class AdminAgentService {
  private readonly logger = new Logger(AdminAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adminService: AdminService,
    private readonly maintenance: MaintenanceService,
  ) {}

  async ask(dto: AdminAgentAskDto, operatorUserId: string, meta: { ip?: string; userAgent?: string }) {
    const { type } = await this.classify(dto.message);

    if (type === 'A') {
      const data = await this.gatherData(dto.tenantId);
      return { type: 'A', answer: this.summarize(dto.message, data), data };
    }

    if (type === 'B') {
      const suggestion = this.buildSuggestion(dto.message, dto.tenantId);
      return {
        type: 'B',
        answer: suggestion.answer,
        suggestedOperation: suggestion.operation,
        needsConfirm: true,
        risk: suggestion.risk,
      };
    }

    // type === 'C'：真正执行
    if (!dto.operation || !dto.confirm) {
      return { type: 'C', executed: false, blocked: true, reason: 'CONFIRM_REQUIRED' };
    }
    const execResult = await this.maintenance.execute(
      dto.operation.id as any,
      dto.operation.params?.tenantId ?? dto.tenantId,
      operatorUserId,
      { reason: 'admin-agent', ip: meta.ip, userAgent: meta.userAgent },
    );
    await this.audit.log({
      action: 'ADMIN_AGENT_EXECUTE',
      resource: 'AdminAgent',
      tenantId: dto.operation.params?.tenantId ?? dto.tenantId,
      userId: operatorUserId,
      detail: { operation: dto.operation, execResult },
      success: execResult.success ?? false,
      failureReason: execResult.error,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      type: 'C',
      executed: execResult.success ?? false,
      operationId: dto.operation.id,
      result: execResult,
    };
  }

  /**
   * 分类：A 信息 / B 建议 / C 执行。这里用稳健的关键词路由，
   * 实际执行永远以显式 confirm + allowlist 校验为准，不依赖分类自动执行。
   */
  private async classify(message: string): Promise<{ type: AgentType }> {
    const m = message.toLowerCase();
    const execKeywords = ['执行', '重同步', '重试', '重建索引', '重新生成索引', '修复', 'resync', 'reindex', 'retry', 'execute', 'run'];
    const suggestKeywords = ['建议', '怎么', '如何', '应该', '能不能', '是否可以', '排查', '怎么办', 'suggest'];
    if (execKeywords.some((k) => m.includes(k))) return { type: 'C' };
    if (suggestKeywords.some((k) => m.includes(k))) return { type: 'B' };
    return { type: 'A' };
  }

  private async gatherData(tenantId?: string) {
    if (tenantId) {
      const [knowledge, conversations, handoffPending, messages] = await Promise.all([
        this.prisma.knowledge.count({ where: { tenantId } }),
        this.prisma.conversation.count({ where: { tenantId } }),
        this.prisma.conversation.count({ where: { tenantId, needsHuman: true, resolvedAt: null } }),
        this.prisma.message.count({ where: { tenantId } }),
      ]);
      return { tenantId, knowledge, conversations, handoffPending, messages };
    }
    return { platform: await this.adminService.platformStats() };
  }

  private summarize(message: string, data: any): string {
    return `以下是与您问题「${message}」相关的系统数据：\n${JSON.stringify(data, null, 2)}`;
  }

  private buildSuggestion(message: string, tenantId?: string) {
    return {
      answer: `针对「${message}」，建议执行以下低风险运维操作（需您二次确认后才会真正执行）：`,
      operation: { id: 'REGENERATE_KB_INDEX', params: { tenantId: tenantId ?? 'ALL' } },
      risk: 'low',
    };
  }
}
