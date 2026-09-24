import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WORKFORCE_SCOPE_KEY, WORKFORCE_JWT_ONLY_KEY } from './workforce.types';

/**
 * 声明接口所需 scopes（仅对 api_key 模式生效；jwt 模式拥有 ['*'] 全量）。
 * 例：@RequireScope('signals:write', 'service:scout')
 */
export const RequireScope = (...scopes: string[]) => SetMetadata(WORKFORCE_SCOPE_KEY, scopes);

/**
 * 仅允许平台用户（JWT）调用，服务密钥（X-Tenant-Key）禁止。
 * 用于租户管理类接口（如创建 TenantApiKey）。
 */
export const JwtOnly = () => SetMetadata(WORKFORCE_JWT_ONLY_KEY, true);

/** 取 WorkforceContext（由 WorkforceTenantGuard 注入 request.workforceContext） */
export const WorkforceTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().workforceContext;
  },
);
