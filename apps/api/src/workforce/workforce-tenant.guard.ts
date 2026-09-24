import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  WORKFORCE_SCOPE_KEY,
  WORKFORCE_JWT_ONLY_KEY,
  WorkforceContext,
} from './workforce.types';

/**
 * P0-3 Workforce 统一鉴权守卫（Tenant 隔离）。
 *
 * 两种认证方式（二选一）：
 *   1. `X-Tenant-Key` 请求头：查 TenantApiKey（sha256(keyHash) 比对，active 且未过期）
 *      → 得到 tenantId + scopes（如 service:scout / service:hunter / leads:write /
 *        signals:write / audit:read），不代表用户身份，actorType=SERVICE。
 *   2. `Authorization: Bearer <JWT>`：复用平台用户（JWT_SECRET 校验 + 查 User），
 *      取 user.tenantId，actorType=USER，scopes=['*']。
 *
 * 额外约束：
 *   - @RequireScope(...)：api_key 模式必须包含声明的 scope（jwt 模式放行）。
 *   - @JwtOnly()：仅允许平台用户调用（服务密钥禁止）。
 *   - X-Trace-Id 请求头贯穿链路；缺失则自动生成，写入 context.traceId。
 */
@Injectable()
export class WorkforceTenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const traceId =
      (req.headers?.['x-trace-id'] as string)?.trim() || randomUUID();

    const ctx: WorkforceContext = {
      mode: null,
      tenantId: null,
      userId: undefined,
      scopes: [],
      actorType: 'SYSTEM',
      source: undefined,
      traceId,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    };

    const apiKey = req.headers?.['x-tenant-key'];
    if (apiKey && String(apiKey).length > 0) {
      await this.authorizeApiKey(req, ctx, String(apiKey));
    } else {
      await this.authorizeJwt(req, ctx);
    }

    // scope 校验（api_key 模式）
    const required = this.reflector.getAllAndOverride<string[]>(
      WORKFORCE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length && ctx.mode === 'api_key') {
      const hasAny = required.some(
        (s) => ctx.scopes.includes(s) || ctx.scopes.includes('*'),
      );
      if (!hasAny) {
        throw new ForbiddenException(
          `Missing required scope(s): ${required.join(', ')}`,
        );
      }
    }

    // JWT-only 校验（租户管理类接口）
    const jwtOnly = this.reflector.getAllAndOverride<boolean>(
      WORKFORCE_JWT_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (jwtOnly && ctx.mode !== 'jwt') {
      throw new ForbiddenException('This endpoint requires a platform user (JWT)');
    }

    req.workforceContext = ctx;
    return true;
  }

  /** X-Tenant-Key → TenantApiKey 解析（keyHash 比对，不泄露明文） */
  private async authorizeApiKey(req: any, ctx: WorkforceContext, apiKey: string) {
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const record = await this.prisma.tenantApiKey.findUnique({
      where: { keyHash: hash },
    });
    if (!record || record.status !== 'active') {
      throw new UnauthorizedException('Invalid or inactive X-Tenant-Key');
    }
    if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('X-Tenant-Key has expired');
    }
    // 更新最后使用时间（失败不阻断）
    this.prisma.tenantApiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    ctx.mode = 'api_key';
    ctx.tenantId = record.tenantId;
    ctx.scopes = record.scopes || [];
    ctx.actorType = 'SERVICE';
    ctx.source = record.name || 'api_key';
  }

  /** Bearer JWT → 平台用户（复用 JWT_SECRET + 查库） */
  private async authorizeJwt(req: any, ctx: WorkforceContext) {
    const header: string = req.headers?.['authorization'] || '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing authentication: X-Tenant-Key or Bearer token required',
      );
    }
    let payload: any;
    try {
      payload = this.jwt.verify(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload?.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    ctx.mode = 'jwt';
    ctx.tenantId = user.tenantId;
    ctx.userId = user.id;
    ctx.scopes = ['*'];
    ctx.actorType = 'USER';
    ctx.source = 'jwt';
  }
}
