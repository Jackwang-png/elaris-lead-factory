import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Admin key 鉴权守卫（管理端公开接口的最小加固）。
 *
 * 原方案：admin key 走 query/body 明文传参（易进日志/URL）。
 * 加固后（key 来源按优先级）：
 *   1. `X-Admin-Key` 请求头（推荐，不进 URL/日志）
 *   2. query `key` / body `key`（向后兼容，ADMIN_KEY_STRICT=true 时禁用）
 *
 * 校验：与 PAYMENT_ADMIN_KEY / REGISTER_ADMIN_KEY 常量时间比较（timingSafeEqual）。
 * 审计：每次尝试写 AuditLog（action=ADMIN_KEY_AUTH，含来源/是否成功/IP/UA）。
 *
 * 配置：
 *   ADMIN_KEY_STRICT=true → 仅接受 X-Admin-Key 请求头
 */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(
    private config: ConfigService,
    private audit: AuditService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const headerKey = req.headers?.['x-admin-key'];
    const strict = (this.config.get<string>('ADMIN_KEY_STRICT') ?? 'false') === 'true';
    const queryKey = strict ? undefined : req.query?.key;
    const bodyKey = strict ? undefined : req.body?.key;

    const candidate = headerKey ?? queryKey ?? bodyKey;
    const source = headerKey ? 'header' : queryKey ? 'query' : bodyKey ? 'body' : 'none';

    const expectedKeys = [
      this.config.get<string>('PAYMENT_ADMIN_KEY'),
      this.config.get<string>('REGISTER_ADMIN_KEY'),
    ].filter(Boolean);

    const valid =
      !!candidate &&
      expectedKeys.length > 0 &&
      expectedKeys.some((k) => k && safeEqual(k, String(candidate)));

    // 审计（失败也记录，便于发现暴力尝试）
    // 平台级公开接口无用户上下文：审计归属取最早创建的租户（AuditLog.tenantId 有 FK）
    const tenantId =
      req.tenantId || req.user?.tenantId || (await this.resolveAuditTenant());
    await this.audit.log({
      action: 'ADMIN_KEY_AUTH',
      resource: 'AdminKey',
      tenantId,
      userId: req.user?.id,
      detail: { source, strict },
      success: valid,
      failureReason: valid ? undefined : 'invalid admin key',
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
    });

    if (!valid) {
      throw new UnauthorizedException('Invalid admin key');
    }
    return true;
  }

  /** 取一个真实租户用于审计归属（无上下文时） */
  private async resolveAuditTenant(): Promise<string> {
    try {
      const t = await this.prisma.tenant.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return t?.id || 'platform';
    } catch {
      return 'platform';
    }
  }
}

/** 常量时间字符串比较（长度不同直接返回 false，避免泄露长度信息） */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
