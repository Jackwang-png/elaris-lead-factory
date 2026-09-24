import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkforceAuditService } from './workforce-audit.service';
import { WorkforceContext } from '../workforce.types';

/** 允许的 scope 集合（防止任意字符串写入） */
export const ALLOWED_API_KEY_SCOPES = [
  'signals:write',
  'signals:read',
  'leads:write',
  'leads:read',
  'companies:write',
  'companies:read',
  'opportunities:write',
  'opportunities:read',
  'hunter:write',
  'audit:read',
  'audit:write',
  'service:scout',
  'service:hunter',
  'service:leadgen',
  'approvals:read',
  'approvals:write',
  '*',
];

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresAt?: string;
}

@Injectable()
export class TenantApiKeyService {
  constructor(
    private prisma: PrismaService,
    private audit: WorkforceAuditService,
  ) {}

  /** 生成密钥：sc_ 前缀 + 32 位随机串。明文仅此一次返回（keyHash 落库）。 */
  generateKey(): { plain: string; prefix: string } {
    const random = Array.from({ length: 32 }, () =>
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(
        Math.floor(Math.random() * 62),
      ),
    ).join('');
    const plain = `sc_${random}`;
    const prefix = `${plain.slice(0, 11)}...${plain.slice(-4)}`;
    return { plain, prefix };
  }

  async create(tenantId: string, input: CreateApiKeyInput, ctx: WorkforceContext) {
    const scopes = (input.scopes || []).filter((s) =>
      ALLOWED_API_KEY_SCOPES.includes(s),
    );
    const { plain, prefix } = this.generateKey();

    const record = await this.prisma.tenantApiKey.create({
      data: {
        name: input.name,
        keyPrefix: prefix,
        keyHash: this.hashKey(plain),
        scopes,
        status: 'active',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        tenantId,
      },
    });

    await this.audit.log({
      action: 'TENANT_API_KEY_CREATE',
      resource: 'TenantApiKey',
      resourceId: record.id,
      tenantId,
      userId: ctx.userId,
      detail: { name: input.name, keyPrefix: prefix, scopes },
      actorType: ctx.actorType,
      source: ctx.source,
      traceId: ctx.traceId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    // 明文只返回一次
    return {
      id: record.id,
      name: record.name,
      keyPrefix: record.keyPrefix,
      key: plain,
      scopes: record.scopes,
      status: record.status,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      tenantId: record.tenantId,
    };
  }

  async list(tenantId: string) {
    const items = await this.prisma.tenantApiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    // 永不返回 keyHash 明文对应的 key；只暴露前缀
    return items.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      status: k.status,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
      tenantId: k.tenantId,
    }));
  }

  /**
   * P0-4.1 安全列表：只暴露 id/prefix/scopes/active/expiresAt/createdAt/lastUsedAt。
   * 绝不返回 raw key / keyHash；active = status === 'active'。
   */
  async listSafe(tenantId: string) {
    const items = await this.prisma.tenantApiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        status: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return items.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      scopes: k.scopes,
      active: k.status === 'active',
      status: k.status,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  }

  /**
   * P0-4.1 撤销：status → revoked，X-Tenant-Key 立即失效（守卫按 status!=='active' 拒绝）。
   * Key Ownership：findFirst({ id, tenantId })，跨 tenant 404。
   */
  async revoke(
    tenantId: string,
    id: string,
    ctx: WorkforceContext,
    reason?: string,
  ) {
    const record = await this.prisma.tenantApiKey.findFirst({
      where: { id, tenantId },
    });
    if (!record) throw new NotFoundException('API key not found');

    if (record.status !== 'revoked') {
      const updated = await this.prisma.tenantApiKey.update({
        where: { id: record.id },
        data: { status: 'revoked' },
      });
      await this.audit.log({
        action: 'API_KEY_REVOKED',
        resource: 'TenantApiKey',
        resourceId: record.id,
        tenantId,
        userId: ctx.userId,
        detail: { name: record.name, keyPrefix: record.keyPrefix, reason: reason || null },
        actorType: ctx.actorType,
        source: ctx.source,
        traceId: ctx.traceId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        id: updated.id,
        name: updated.name,
        prefix: updated.keyPrefix,
        active: updated.status === 'active',
        status: updated.status,
        expiresAt: updated.expiresAt,
      };
    }
    // 幂等：已撤销直接返回当前状态（不再重复审计）
    return {
      id: record.id,
      name: record.name,
      prefix: record.keyPrefix,
      active: false,
      status: record.status,
      expiresAt: record.expiresAt,
    };
  }

  /**
   * P0-4.1 重新激活：非 active → active。
   * 注意：激活后仍需 expiresAt 未过，X-Tenant-Key 才可用。
   */
  async activate(
    tenantId: string,
    id: string,
    ctx: WorkforceContext,
    reason?: string,
  ) {
    const record = await this.prisma.tenantApiKey.findFirst({
      where: { id, tenantId },
    });
    if (!record) throw new NotFoundException('API key not found');

    if (record.status !== 'active') {
      const updated = await this.prisma.tenantApiKey.update({
        where: { id: record.id },
        data: { status: 'active' },
      });
      await this.audit.log({
        action: 'API_KEY_ACTIVATED',
        resource: 'TenantApiKey',
        resourceId: record.id,
        tenantId,
        userId: ctx.userId,
        detail: { name: record.name, keyPrefix: record.keyPrefix, reason: reason || null },
        actorType: ctx.actorType,
        source: ctx.source,
        traceId: ctx.traceId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      return {
        id: updated.id,
        name: updated.name,
        prefix: updated.keyPrefix,
        active: updated.status === 'active',
        status: updated.status,
        expiresAt: updated.expiresAt,
      };
    }
    return {
      id: record.id,
      name: record.name,
      prefix: record.keyPrefix,
      active: true,
      status: record.status,
      expiresAt: record.expiresAt,
    };
  }

  hashKey(plain: string): string {
    return require('node:crypto').createHash('sha256').update(plain).digest('hex');
  }
}
