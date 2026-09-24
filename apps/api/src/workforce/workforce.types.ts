/**
 * P0-3 Workforce 适配层 —— 共享类型
 *
 * Scout -> IntelligenceSignal -> Company/Lead -> Hunter ->
 * Qualified Lead -> Opportunity/Support 全链路上下文。
 */

export type WorkforceAuthMode = 'jwt' | 'api_key';

export type ActorType = 'USER' | 'AI_EMPLOYEE' | 'SERVICE' | 'SYSTEM';

export interface WorkforceContext {
  /** 认证方式：jwt（平台用户）或 api_key（X-Tenant-Key 服务密钥） */
  mode: WorkforceAuthMode;
  /** 强制租户隔离：所有读写必须带 tenantId */
  tenantId: string;
  /** JWT 模式下的平台用户 id（api_key 模式无） */
  userId?: string;
  /** api_key 模式下的 scopes（jwt 模式为 ['*'] 全量） */
  scopes: string[];
  /** 审计 actorType：jwt=USER，api_key 按 source 语义映射 */
  actorType: ActorType;
  /** 来源标识：scout / hunter / manual / api_key 名称等 */
  source?: string;
  /** 链路 traceId：X-Trace-Id 请求头或自动生成，贯穿 Signal->Lead->Opportunity->Handoff */
  traceId: string;
  ip?: string;
  userAgent?: string;
}

export const WORKFORCE_SCOPE_KEY = 'workforce:required-scopes';
export const WORKFORCE_JWT_ONLY_KEY = 'workforce:jwt-only';
