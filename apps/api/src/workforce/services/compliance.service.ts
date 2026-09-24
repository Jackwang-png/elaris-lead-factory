import { Injectable, Logger } from '@nestjs/common';

export type ComplianceStatus = 'verified' | 'pending' | 'rejected';

export interface ComplianceCheckInput {
  sourceType?: string; // daily_batch | manual_submit | event_trigger
  credibility?: string; // verified | pending | rejected
  signalType?: string;
  action?: string; // external_contact / batch_operation / internal_update
  detail?: any;
}

export interface ComplianceCheckResult {
  status: ComplianceStatus;
  reason: string;
  checks: string[];
}

/**
 * P0-3 ComplianceService（精简版，参考 AI-Sales-Hunter compliance_engine.py）。
 *
 * 数据来源合规校验：
 *   - credibility=verified（明确可信来源/官方公告）→ verified
 *   - credibility=pending 或未声明 → pending（需人工复核后才可用于外联）
 *   - credibility=rejected / 敏感信号类型 → rejected
 * 结果一律写入 AuditLog（由调用方落审计）。
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger('ComplianceService');

  check(input: ComplianceCheckInput): ComplianceCheckResult {
    const checks: string[] = [];
    const cred = (input.credibility || '').toLowerCase();

    // 1) 来源可信度
    if (cred === 'verified') {
      checks.push('source_credibility=verified');
      return { status: 'verified', reason: 'source credibility verified', checks };
    }
    if (cred === 'rejected') {
      checks.push('source_credibility=rejected');
      return { status: 'rejected', reason: 'source marked as rejected', checks };
    }

    // 2) 信号类型黑名单（隐私/敏感类信号不得直接使用）
    const sensitive = [
      'personal_data_leak',
      'stolen_contact',
      'bulk_scrape',
      'purchased_list',
    ];
    const signalType = (input.signalType || '').toLowerCase();
    if (sensitive.includes(signalType)) {
      checks.push(`sensitive_signal_type=${signalType}`);
      return { status: 'rejected', reason: `sensitive signal type: ${signalType}`, checks };
    }

    // 3) 外联/批量外联类操作：无论来源，pending（需人工审批），禁止自动执行
    const action = (input.action || '').toLowerCase();
    if (
      action === 'external_contact' ||
      action === 'batch_operation' ||
      action === 'bulk_outreach' ||
      action === 'outreach'
    ) {
      checks.push(`${action}_requires_approval`);
      return {
        status: 'pending',
        reason: `${action} requires human approval`,
        checks,
      };
    }

    // 4) 内部更新类操作：low risk，自动放行
    if (action === 'internal_update') {
      checks.push('internal_update_auto_allowed');
      return { status: 'verified', reason: 'internal update, auto allowed', checks };
    }

    // 5) 其余：credibility=pending 或未声明 → pending（复核后可用）
    checks.push(`source_credibility=${cred || 'unstated'}`);
    if (cred === 'pending' || !cred) {
      return {
        status: 'pending',
        reason: 'source credibility pending verification',
        checks,
      };
    }
    return { status: 'verified', reason: 'ok', checks };
  }
}
