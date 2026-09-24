import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  async register(registerDto: RegisterDto, ip?: string, userAgent?: string) {
    const { email, password, username, firstName, plan = 'FREE', inviteCode, referralCode } = registerDto;

    // 邮箱冲突校验（防止半注册 / 重复奖励）
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 套餐解析；未知套餐直接拒绝注册
    const planRecord = await this.prisma.plan.findFirst({ where: { name: plan } });
    if (!planRecord) {
      throw new BadRequestException(`Unknown plan: ${plan}`);
    }
    const isTrial = planRecord.name === 'FREE';

    const now = new Date();
    // 7 天 Trial；若携带有效 USER_REFERRAL 推荐码，试用延长至 10 天（7+3）
    const trialDays = isTrial ? (referralCode ? 10 : 7) : 0;
    const expireAt = new Date(now);
    if (trialDays > 0) expireAt.setDate(expireAt.getDate() + trialDays);

    // L2 管理员邀请门禁（ADMIN_INVITE）：开启时必须有 inviteCode（referralCode 不绕过门禁）
    const requireInvite = process.env.REGISTER_INVITE_REQUIRED === 'true';
    if (requireInvite && !inviteCode && !referralCode) {
      throw new BadRequestException('请填写邀请码');
    }

    // 预校验 ADMIN_INVITE（友好报错；原子消费在事务内完成）
    let inviteMeta: { maxUses: number } | null = null;
    if (inviteCode) {
      const code = await this.prisma.inviteCode.findUnique({ where: { code: inviteCode } });
      if (!code || code.type !== 'ADMIN_INVITE') {
        throw new BadRequestException('邀请码无效或已过期');
      }
      if (code.expiresAt && code.expiresAt < now) {
        throw new BadRequestException('邀请码无效或已过期');
      }
      inviteMeta = { maxUses: code.maxUses };
    }

    // 预校验 USER_REFERRAL 推荐码（邀请人信息 + 过期/类型校验）
    let referralMeta: { codeId: string; inviterUserId: string; inviterTenantId: string } | null = null;
    if (referralCode) {
      const code = await this.prisma.inviteCode.findUnique({ where: { code: referralCode } });
      if (!code || code.type !== 'USER_REFERRAL') {
        throw new BadRequestException('推荐码无效或已失效');
      }
      if (code.expiresAt && code.expiresAt < now) {
        throw new BadRequestException('推荐码无效或已失效');
      }
      if (!code.createdBy) {
        throw new BadRequestException('推荐码无效或已失效');
      }
      const inviter = await this.prisma.user.findUnique({ where: { id: code.createdBy } });
      if (!inviter) {
        throw new BadRequestException('推荐码无效或已失效');
      }
      referralMeta = { codeId: code.id, inviterUserId: inviter.id, inviterTenantId: inviter.tenantId };
    }

    let referralUseId: string | undefined;

    try {
      const { tenant, user } = await this.prisma.$transaction(async (tx) => {
        // 原子消费 ADMIN_INVITE（usedCount +1，防止并发重复）；永不过期码用 OR 处理
        if (inviteCode && inviteMeta) {
          const claimed = await tx.inviteCode.updateMany({
            where: {
              code: inviteCode,
              type: 'ADMIN_INVITE',
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              usedCount: { lt: inviteMeta.maxUses },
            },
            data: { usedCount: { increment: 1 } },
          });
          if (claimed.count === 0) {
            throw new BadRequestException('邀请码已被使用完');
          }
        }

        const tenant = await tx.tenant.create({
          data: { name: username || email.split('@')[0] },
        });
        const user = await tx.user.create({
          data: {
            email,
            username: username || email.split('@')[0],
            password: hashedPassword,
            firstName: firstName || username || email.split('@')[0],
            tenantId: tenant.id,
            role: 'merchant',
          },
        });

        if (isTrial) {
          await tx.subscription.create({
            data: {
              tenantId: tenant.id,
              planId: planRecord.id,
              status: 'ACTIVE',
              startAt: now,
              expireAt,
            },
          });
        }

        // 裂变奖励（USER_REFERRAL）：邀请人 +3 天，被邀请人 +3 天（已并入 trialDays）
        if (referralCode && referralMeta) {
          // 自邀防护：邀请人不能是刚注册的用户本身
          if (referralMeta.inviterUserId === user.id) {
            throw new BadRequestException('不能邀请自己');
          }
          const referralUse = await tx.referralUse.create({
            data: {
              referralCodeId: referralMeta.codeId,
              inviterUserId: referralMeta.inviterUserId,
              usedByUserId: user.id,
              tenantId: tenant.id,
              rewardDays: 3,
              rewardStatus: 'APPLIED',
              rewardAppliedAt: now,
            },
          });
          referralUseId = referralUse.id;

          // 延长邀请人订阅 +3 天（原子 SQL，兼容并发；无活跃订阅则新建 +3 天奖励订阅）
          const inviterSub = await tx.subscription.findFirst({
            where: { tenantId: referralMeta.inviterTenantId, status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
          });
          if (inviterSub) {
            await tx.$executeRaw`UPDATE "Subscription" SET "expireAt" = "expireAt" + interval '3 days' WHERE id = ${inviterSub.id}`;
          } else {
            await tx.subscription.create({
              data: {
                tenantId: referralMeta.inviterTenantId,
                planId: planRecord.id,
                status: 'ACTIVE',
                startAt: now,
                expireAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
              },
            });
          }
        }

        return { tenant, user };
      });

      // 审计：注册成功
      await this.auditService.log({
        action: 'USER_REGISTER',
        resource: 'User',
        resourceId: user.id,
        tenantId: tenant.id,
        userId: user.id,
        detail: { email, plan, inviteCode: inviteCode || null, referralCode: referralCode || null },
        success: true,
        ip,
        userAgent,
      });

      if (referralUseId && referralMeta) {
        await this.auditService.log({
          action: 'REFERRAL_USED',
          resource: 'ReferralUse',
          resourceId: referralUseId,
          tenantId: tenant.id,
          userId: user.id,
          detail: { inviterUserId: referralMeta.inviterUserId, rewardDays: 3 },
          success: true,
        });
        await this.auditService.log({
          action: 'REFERRAL_REWARD_APPLIED',
          resource: 'ReferralUse',
          resourceId: referralUseId,
          tenantId: tenant.id,
          userId: user.id,
          detail: { inviterUserId: referralMeta.inviterUserId, inviteeUserId: user.id, rewardDays: 3 },
          success: true,
        });
      }

      const accessToken = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        tenantId: tenant.id,
        role: user.role,
      });
      return {
        accessToken,
        user: { id: user.id, email: user.email, name: user.firstName, tenantId: tenant.id },
      };
    } catch (err: any) {
      if (referralCode) {
        await this.auditService
          .log({
            action: 'REFERRAL_REWARD_FAILED',
            resource: 'ReferralUse',
            tenantId: 'unknown',
            userId: undefined,
            detail: { email, error: err?.message },
            success: false,
            failureReason: err?.message,
          })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  async login(loginDto: LoginDto, ip?: string, userAgent?: string) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      // 审计日志：登录失败（用户不存在）
      await this.auditService.log({
        action: 'USER_LOGIN',
        resource: 'User',
        tenantId: 'unknown',
        detail: { email },
        success: false,
        failureReason: 'User not found',
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // 审计日志：登录失败（密码错误）
      await this.auditService.log({
        action: 'USER_LOGIN',
        resource: 'User',
        resourceId: user.id,
        tenantId: user.tenantId,
        userId: user.id,
        detail: { email },
        success: false,
        failureReason: 'Invalid password',
        ip,
        userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      await this.auditService
        .log({
          action: 'USER_LOGIN',
          resource: 'User',
          resourceId: user.id,
          tenantId: user.tenantId,
          userId: user.id,
          detail: { email },
          success: false,
          failureReason: 'Account disabled',
          ip,
          userAgent,
        })
        .catch(() => undefined);
      throw new UnauthorizedException('账号已被禁用');
    }

    // 记录最后登录时间（不阻塞登录）
    await this.prisma.user
      .update({ where: { id: user.id }, data: { lastLogin: new Date() } })
      .catch(() => undefined);

    // Generate JWT
    const payload = { sub: user.id, email: user.email, tenantId: user.tenantId, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // 审计日志：登录成功
    await this.auditService.log({
      action: 'USER_LOGIN',
      resource: 'User',
      resourceId: user.id,
      tenantId: user.tenantId,
      userId: user.id,
      detail: { email },
      success: true,
      ip,
      userAgent,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.firstName,
        tenantId: user.tenantId,
        role: user.role,
      },
    };
  }
}
