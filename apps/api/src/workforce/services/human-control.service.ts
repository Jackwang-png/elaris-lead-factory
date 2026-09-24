import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskDecision {
  level: RiskLevel;
  /** low→auto（自动放行）；medium→approval（需审批）；high→human-only（仅人工） */
  mode: 'auto' | 'approval' | 'human-only';
  reason: string;
}

/**
 * P0-3 HumanControlService（精简版，参考 AI-Sales-Hunter human_control_service.py）。
 *
 * 风险分级：
 *   - 外联/批量操作/高金额商机 → high（human-only，PENDING_APPROVAL，绝不全自动发送）
 *   - 商机创建/合格判定 → medium（approval，可被 AUTO_APPROVE 环境变量覆盖为 auto）
 *   - 内部状态推进/数据写入 → low（auto）
 *
 * 环境变量：
 *   - WORKFORCE_AUTO_APPROVE=true → 整体跳过审批（仅建议测试环境）
 *   - HUNTER_AUTO_APPROVE=true → 仅 Hunter 队列/合格判定跳过人工确认
 *   - AUTO_APPROVE=true → 兼容旧名，等同 HUNTER_AUTO_APPROVE
 */
@Injectable()
export class HumanControlService {
  private readonly logger = new Logger('HumanControlService');

  constructor(private config: ConfigService) {}

  /** 风险分级 */
  classify(action: string, payload?: any): RiskDecision {
    const a = action.toUpperCase();
    // 兼容 payload.action（如 hunter-queue 的 dto.action='outreach'）
    const extra = payload?.action ? String(payload.action).toUpperCase() : '';
    const combined = `${a} ${extra}`;

    // high：外联、批量操作、对外发送 —— 人类专属
    if (
      /OUTREACH|EXTERNAL_?CONTACT|BULK|BATCH_?SEND|MASS_?SEND|SEND_?MESSAGE|OUTBOUND/i.test(combined) ||
      (payload?.channel === 'outbound') ||
      (payload?.batch && payload.batch > 1)
    ) {
      return { level: 'high', mode: 'human-only', reason: 'external outreach / batch operation requires human approval' };
    }

    // medium：商机、合格判定、状态升级、Hunter 队列
    if (/OPPORTUNITY|QUALIF|HANDOFF|HUNTER_QUEUE/i.test(combined)) {
      return { level: 'medium', mode: 'approval', reason: 'business decision requires approval' };
    }

    // low：内部数据写入/状态推进
    return { level: 'low', mode: 'auto', reason: 'internal update, safe to auto' };
  }

  /** 是否自动放行（跳过人工确认） */
  isAutoApproved(action: string): boolean {
    const a = action.toUpperCase();
    const hunterAuto =
      this.config.get<string>('HUNTER_AUTO_APPROVE') === 'true' ||
      this.config.get<string>('AUTO_APPROVE') === 'true';
    const globalAuto =
      this.config.get<string>('WORKFORCE_AUTO_APPROVE') === 'true';

    if (globalAuto) return true;
    if (/HUNTER_QUEUE|QUALIF|HANDOFF/i.test(a)) return hunterAuto;
    return false;
  }

  /** 审批决策：返回是否需要人工确认 */
  decide(action: string, payload?: any): {
    decision: RiskDecision;
    approvalRequired: boolean;
    autoApproved: boolean;
  } {
    const decision = this.classify(action, payload);
    if (decision.mode === 'human-only') {
      return { decision, approvalRequired: true, autoApproved: false };
    }
    if (decision.mode === 'approval') {
      const auto = this.isAutoApproved(action);
      return { decision, approvalRequired: !auto, autoApproved: auto };
    }
    return { decision, approvalRequired: false, autoApproved: true };
  }
}
