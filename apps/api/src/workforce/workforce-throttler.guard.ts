import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * P0-4.2 Workforce 限流守卫（复用 @nestjs/throttler，不重复造系统）。
 *
 * 限流维度（第一优先级 = Tenant）：
 *   1. tenantId（WorkforceTenantGuard 已注入 req.workforceContext）→ `tenant:<id>`
 *   2. X-Tenant-Key（未认证场景兜底）→ `key:<hash>`（只做桶标识，不落库不打印）
 *   3. IP（最后兜底）→ `ip:<addr>`
 *
 * 目的：同一 NAT/IP 下多个正常 tenant 互不影响；单个 tenant 恶意/失控
 * 调用只影响自身桶。
 *
 * 超限响应：ThrottlerException → Nest 统一 JSON：
 *   { "statusCode": 429, "message": "Rate limit exceeded, please retry later",
 *     "error": "Too Many Requests" }
 * 不泄露 database details / internal stack / tenant internals。
 *
 * 使用：@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
 * 配额：模块默认 60 req/min/tenant；高风险写接口用 @Throttle 收紧到 20；
 * Audit 查询放宽到 120。
 */
@Injectable()
export class WorkforceThrottlerGuard extends ThrottlerGuard {
  /** 统一 429 文案（Nest 会包装为标准 JSON 错误结构） */
  protected errorMessage =
    'Rate limit exceeded, please retry later';

  /**
   * 按 tenant 优先追踪；无认证上下文时退化为 key/IP。
   * 注意：令牌本身不参与桶 key 计算之外的任何持久化。
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const wf = req?.workforceContext;
    if (wf?.tenantId) {
      return `tenant:${wf.tenantId}`;
    }
    const apiKey = req?.headers?.['x-tenant-key'];
    if (apiKey && String(apiKey).length > 0) {
      return `key:${String(apiKey)}`;
    }
    return `ip:${req?.ip || 'unknown'}`;
  }
}
