import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AuthService } from './auth.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { AiQuotaService } from '../quota/ai-quota.service';
import { SubscriptionStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

/* ------------------------------------------------------------------ */
/* 内存 mock：模拟 Prisma + JWT + Audit，无需数据库即可验证 7 天 Trial   */
/* ------------------------------------------------------------------ */
function buildPrisma() {
  const calls = { subCreate: [] as any[], userFind: 0 };
  const plans: Record<string, any> = {
    FREE: { id: 'p_free', name: 'FREE', price: 0, dailyLimit: 100 },
    PRO: { id: 'p_pro', name: 'PRO', price: 299, dailyLimit: 20000 },
  };
  const prisma: any = {
    user: {
      findUnique: async () => {
        calls.userFind++;
        return null;
      },
      create: async (d: any) => ({ id: 'u1', tenantId: 't1', ...d.data }),
    },
    tenant: {
      create: async (d: any) => ({ id: 't1', ...d.data }),
    },
    plan: {
      findFirst: async ({ where }: any) => plans[where.name] ?? null,
    },
    subscription: {
      create: async (d: any) => {
        calls.subCreate.push(d.data);
        return { id: 's1', ...d.data };
      },
      findFirst: async () => null,
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (cb: any) => cb(prisma),
  };
  return { prisma, calls };
}

function buildAuth(prisma: any) {
  const jwtService: any = { sign: () => 'jwt-token' };
  const auditService: any = { log: async () => {} };
  return new AuthService(prisma, jwtService, auditService);
}

const DAY = 24 * 60 * 60 * 1000;

describe('GROWTH-STAFF-04: 7天 Trial 注册', () => {
  test('新用户默认 7 天 Trial：FREE 注册创建 ACTIVE 订阅，expireAt ≈ now+7d', async () => {
    const { prisma, calls } = buildPrisma();
    const auth = buildAuth(prisma);
    const res = await auth.register({
      email: 'trial@wanlan.ai',
      password: 'pass123456',
      name: 'U',
      plan: 'FREE',
    });
    assert.ok(res.accessToken, '应返回 token');
    assert.equal(calls.subCreate.length, 1, '应创建且仅创建一个订阅（无重复）');
    const sub = calls.subCreate[0];
    assert.equal(sub.status, 'ACTIVE');
    assert.equal(sub.planId, 'p_free');
    assert.ok(sub.startAt instanceof Date, 'startAt 应为当前时间');
    const durationDays = (sub.expireAt - sub.startAt) / DAY;
    assert.ok(Math.abs(durationDays - 7) < 0.001, `应为 7 天，实际 ${durationDays}`);
  });

  test('注册 PRO 付费套餐：不创建订阅（由支付流程激活）', async () => {
    const { prisma, calls } = buildPrisma();
    const auth = buildAuth(prisma);
    const res = await auth.register({
      email: 'paid@wanlan.ai',
      password: 'pass123456',
      name: 'U',
      plan: 'PRO',
    });
    assert.ok(res.accessToken, '付费注册仍应成功返回 token');
    assert.equal(calls.subCreate.length, 0, '付费套餐注册不应创建订阅');
  });

  test('未知套餐：注册被拒绝（BadRequestException）', async () => {
    const { prisma } = buildPrisma();
    const auth = buildAuth(prisma);
    await assert.rejects(
      () =>
        auth.register({
          email: 'x@wanlan.ai',
          password: 'pass123456',
          name: 'U',
          plan: 'whatever',
        }),
      (e: any) => e instanceof BadRequestException,
    );
  });

  test('已存在邮箱：注册冲突拒绝', async () => {
    const { prisma } = buildPrisma();
    prisma.user.findUnique = async () => ({ id: 'existing' }); // 模拟已注册
    const auth = buildAuth(prisma);
    await assert.rejects(
      () =>
        auth.register({
          email: 'dup@wanlan.ai',
          password: 'pass123456',
          name: 'U',
          plan: 'FREE',
        }),
      (e: any) => e.status === 409,
    );
  });
});

describe('GROWTH-STAFF-04: isTrial 推导（不新增字段）', () => {
  function buildSubService(sub: any) {
    const prisma: any = { subscription: { findFirst: async () => sub } };
    return new SubscriptionService(prisma);
  }

  test('FREE + 7 天 → isTrial=true', async () => {
    const sub = {
      id: 's',
      status: SubscriptionStatus.ACTIVE,
      startAt: new Date(),
      expireAt: new Date(Date.now() + 7 * DAY),
      plan: { price: 0 },
    };
    const r: any = await buildSubService(sub).getCurrentSubscription('t');
    assert.equal(r.isTrial, true);
  });

  test('FREE 任意时长（含 +3 延长）→ isTrial=true（始终免费层）', async () => {
    const sub = {
      id: 's',
      status: SubscriptionStatus.ACTIVE,
      startAt: new Date(),
      expireAt: new Date(Date.now() + 30 * DAY),
      plan: { price: 0 },
    };
    const r: any = await buildSubService(sub).getCurrentSubscription('t');
    assert.equal(r.isTrial, true);
  });

  test('FREE + 3 天 referral 延长（10 天）→ isTrial 仍为 true', async () => {
    const sub = {
      id: 's',
      status: SubscriptionStatus.ACTIVE,
      startAt: new Date(),
      expireAt: new Date(Date.now() + 10 * DAY),
      plan: { price: 0 },
    };
    const r: any = await buildSubService(sub).getCurrentSubscription('t');
    assert.equal(r.isTrial, true);
  });

  test('PRO 付费（price>0）→ isTrial=false', async () => {
    const sub = {
      id: 's',
      status: SubscriptionStatus.ACTIVE,
      startAt: new Date(),
      expireAt: new Date(Date.now() + 7 * DAY),
      plan: { price: 299 },
    };
    const r: any = await buildSubService(sub).getCurrentSubscription('t');
    assert.equal(r.isTrial, false);
  });

  test('无订阅 → 抛 NotFound', async () => {
    const prisma: any = { subscription: { findFirst: async () => null } };
    await assert.rejects(() => new SubscriptionService(prisma).getCurrentSubscription('t'));
  });
});

describe('GROWTH-STAFF-04: Quota 与 Trial 衔接', () => {
  function buildQuota(sub: any) {
    const prisma: any = {};
    const subscriptionService = { getCurrentSubscription: async () => sub };
    const usageService = { getDailyUsage: async () => ({ messageCount: 0, tokenUsage: 0 }) };
    return new AiQuotaService(prisma, subscriptionService as any, usageService as any);
  }

  test('Trial 有效期间：/me/quota enabled=true，dailyLimit=100', async () => {
    const sub = {
      status: SubscriptionStatus.ACTIVE,
      expireAt: new Date(Date.now() + 3 * DAY),
      plan: { dailyLimit: 100 },
    };
    const quota = buildQuota(sub);
    const state = await quota.getQuotaState('t');
    assert.equal(state.enabled, true);
    assert.equal(state.dailyLimit, 100);
    assert.equal(state.remaining, 100);
  });

  test('Trial 过期：AI 请求返回 subscription_expired', async () => {
    const sub = {
      status: SubscriptionStatus.ACTIVE,
      expireAt: new Date(Date.now() - 1000),
      plan: { dailyLimit: 100 },
    };
    const quota = buildQuota(sub);
    await assert.rejects(
      () => quota.assertCanRespond('t'),
      (e: any) => e.getResponse().code === 'subscription_expired',
    );
  });
});
