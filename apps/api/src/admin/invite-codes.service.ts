import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'node:crypto';

/**
 * L2: 注册邀请码管理（生成 / 列表 / 停用）。
 * 鉴权：PAYMENT_ADMIN_KEY 或 REGISTER_ADMIN_KEY（.env），任一匹配即可。
 */
@Injectable()
export class InviteCodesService {
  // 生成字符集：大写字母 + 数字，排除易混字符 0O1Il
  private static readonly CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private static readonly CODE_LENGTH = 8;
  // USER_REFERRAL 默认可邀请人数上限（一个码可被多个不同新用户使用）
  private static readonly USER_REFERRAL_MAX_USES = 1000;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** 校验 admin key（PAYMENT_ADMIN_KEY 或 REGISTER_ADMIN_KEY） */
  private assertAdminKey(key?: string) {
    const paymentKey = this.config.get<string>('PAYMENT_ADMIN_KEY');
    const registerKey = this.config.get<string>('REGISTER_ADMIN_KEY');
    const valid = [paymentKey, registerKey].filter(Boolean);
    if (!key || valid.length === 0 || !valid.includes(key)) {
      throw new UnauthorizedException('Invalid admin key');
    }
  }

  /** 生成一个 8 位邀请码（crypto 随机，冲突重试） */
  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const bytes = randomBytes(InviteCodesService.CODE_LENGTH);
      const code = Array.from(bytes)
        .map((b) => InviteCodesService.CHARSET[b % InviteCodesService.CHARSET.length])
        .join('');
      const existing = await this.prisma.inviteCode.findUnique({ where: { code } });
      if (!existing) return code;
    }
    throw new BadRequestException('邀请码生成失败，请重试');
  }

  /**
   * 批量生成邀请码
   * @param count 生成数量（1-100）
   * @param maxUses 每个码可用次数（默认 1）
   * @param remark 备注
   * @param expiresInDays 有效天数（默认 30）
   */
  async generate(
    params: {
      count?: number;
      maxUses?: number;
      remark?: string;
      expiresInDays?: number;
      type?: 'ADMIN_INVITE' | 'USER_REFERRAL';
    },
    adminKey?: string,
  ) {
    this.assertAdminKey(adminKey);
    const type: 'ADMIN_INVITE' | 'USER_REFERRAL' =
      params?.type === 'USER_REFERRAL' ? 'USER_REFERRAL' : 'ADMIN_INVITE';
    const isReferral = type === 'USER_REFERRAL';
    const count = Math.min(Math.max(parseInt(String(params?.count ?? 1), 10) || 1, 1), 100);
    const maxUses = isReferral
      ? Math.max(
          parseInt(String(params?.maxUses ?? InviteCodesService.USER_REFERRAL_MAX_USES), 10) ||
            InviteCodesService.USER_REFERRAL_MAX_USES,
          1,
        )
      : Math.max(parseInt(String(params?.maxUses ?? 1), 10) || 1, 1);
    const expiresAt = isReferral
      ? null
      : new Date(
          Date.now() +
            (Math.max(parseInt(String(params?.expiresInDays ?? 30), 10) || 30, 1)) * 24 * 60 * 60 * 1000,
        );

    const codes: Array<{ code: string; type: string; maxUses: number; expiresAt: Date | null }> = [];
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < count; i++) {
        const code = await this.generateUniqueCode();
        await tx.inviteCode.create({
          data: {
            code,
            type,
            maxUses,
            expiresAt,
            remark: params?.remark || null,
          },
        });
        codes.push({ code, type, maxUses, expiresAt });
      }
    });
    return { items: codes };
  }

  /**
   * 用户自己的裂变邀请码（USER_REFERRAL）。
   * 首次请求自动创建（type=USER_REFERRAL, createdBy=userId），后续返回同一码。
   * 并发创建时依赖 code 唯一约束 + 重试，避免重复生成。
   */
  async getOrCreateUserReferralCode(userId: string, tenantId: string) {
    const existing = await this.prisma.inviteCode.findFirst({
      where: { type: 'USER_REFERRAL', createdBy: userId },
    });
    if (existing) {
      return this.toReferralView(existing);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = await this.generateUniqueCode();
      try {
        const rec = await this.prisma.inviteCode.create({
          data: {
            code,
            type: 'USER_REFERRAL',
            maxUses: InviteCodesService.USER_REFERRAL_MAX_USES,
            expiresAt: null,
            createdBy: userId,
            remark: 'user referral',
          },
        });
        await this.prisma.auditLog
          .create({
            data: {
              tenantId,
              userId,
              action: 'REFERRAL_CREATED',
              resource: 'InviteCode',
              resourceId: rec.id,
              detail: { code: rec.code, type: 'USER_REFERRAL' },
              success: true,
            },
          })
          .catch(() => undefined);
        return this.toReferralView(rec);
      } catch (e: any) {
        // 并发唯一冲突则重试
        if (e?.code === 'P2002') continue;
        throw e;
      }
    }
    throw new BadRequestException('推荐码生成失败，请重试');
  }

  private toReferralView(c: {
    code: string;
    type: string;
    maxUses: number;
    usedCount: number;
    expiresAt: Date | null;
    createdAt: Date;
  }) {
    return {
      code: c.code,
      type: c.type,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      remaining: Math.max(c.maxUses - c.usedCount, 0),
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    };
  }

  /** 邀请码列表（按创建时间倒序） */
  async list(adminKey?: string) {
    this.assertAdminKey(adminKey);
    const items = await this.prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return {
      items: items.map((c) => ({
        id: c.id,
        code: c.code,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        remaining: Math.max(c.maxUses - c.usedCount, 0),
        expiresAt: c.expiresAt,
        remark: c.remark,
        createdAt: c.createdAt,
      })),
    };
  }

  /** 停用邀请码（置 expiresAt = now） */
  async revoke(code: string, adminKey?: string) {
    this.assertAdminKey(adminKey);
    const record = await this.prisma.inviteCode.findUnique({ where: { code } });
    if (!record) {
      throw new BadRequestException('邀请码不存在');
    }
    const updated = await this.prisma.inviteCode.update({
      where: { id: record.id },
      data: { expiresAt: new Date() },
    });
    return { code: updated.code, revoked: true, expiresAt: updated.expiresAt };
  }
}
