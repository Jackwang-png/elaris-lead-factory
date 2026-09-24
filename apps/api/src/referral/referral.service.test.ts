import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AuthService } from '../auth/auth.service';
import { InviteCodesService } from '../admin/invite-codes.service';
import { BadRequestException } from '@nestjs/common';

/**
 * GROWTH-STAFF-05 裂变奖励（USER_REFERRAL）+ 注册门禁（ADMIN_INVITE）单元测试。
 * 全部使用内存 mock，无需数据库即可验证核心逻辑与事务原子性。
 */
const DAY = 24 * 60 * 60 * 1000;

function buildPrisma(state: any = {}) {
  const calls: any = {
    subCreate: [] as any[],
    referralUseCreate: [] as any[],
    executeRaw: [] as any[],
    updateMany: [] as any[],
    auditLog: [] as any[],
  };
  const seenReferral = new Set<string>();
  let userSeq = 0;
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.email) return state.existingUser ?? null;
        if (where.id) return state.inviterUser ?? null;
        return null;
      },
      create: async (d: any) => ({
        id: state.fixedUserId ?? 'u_new_' + ++userSeq,
        tenantId: 't_new',
        ...d.data,
      }),
    },
    tenant: { create: async (d: any) => ({ id: 't_new', ...d.data }) },
    plan: { findFirst: async ({ where }: any) => (state.plans ?? {})[where.name] ?? null },
    inviteCode: {
      findUnique: async ({ where }: any) => (state.inviteCodes ?? {})[where.code] ?? null,
      updateMany: async ({ where }: any) => {
        calls.updateMany.push(where);
        const c = (state.inviteCodes ?? {})[where.code];
        if (c && c.usedCount < c.maxUses) {
          c.usedCount += 1;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    subscription: {
      create: async (d: any) => {
        calls.subCreate.push(d.data);
        return { id: 's_' + calls.subCreate.length, ...d.data };
      },
      findFirst: async () => state.inviterSub ?? null,
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    referralUse: {
      create: async (d: any) => {
        const key = d.data.referralCodeId + ':' + d.data.usedByUserId;
        if (seenReferral.has(key)) {
          const e: any = new Error('Unique constraint failed');
          e.code = 'P2002';
          throw e;
        }
        seenReferral.add(key);
        calls.referralUseCreate.push(d.data);
        return { id: 'ru_' + calls.referralUseCreate.length, ...d.data };
      },
      findUnique: async () => null,
    },
    auditLog: { create: async (d: any) => { calls.auditLog.push(d); return {}; } },
    $executeRaw: async (...args: any[]) => { calls.executeRaw.push(args); return { count: 1 }; },
    $transaction: async (cb: any) => cb(prisma),
  };
  return { prisma, calls };
}

function buildAuth(prisma: any) {
  const jwtService: any = { sign: () => 'jwt' };
  const auditService: any = { log: async () => {} };
  return new AuthService(prisma, jwtService, auditService);
}

function withReferralState(extra: any = {}) {
  return buildPrisma({
    plans: { FREE: { id: 'p_free', name: 'FREE', price: 0, dailyLimit: 100 } },
    inviteCodes: {
      REF1: { id: 'c1', code: 'REF1', type: 'USER_REFERRAL', maxUses: 1000, usedCount: 0, expiresAt: null, createdBy: 'u_inv' },
    },
    inviterUser: { id: 'u_inv', tenantId: 't_inv' },
    inviterSub: { id: 's_inv', tenantId: 't_inv', status: 'ACTIVE', expireAt: new Date(Date.now() + 7 * DAY) },
    ...extra,
  });
}

describe('GROWTH-STAFF-05: 注册门禁 (L2 ADMIN_INVITE)', () => {
  test('无邀请码且开启门禁 → 拒绝 请填写邀请码', async () => {
    const prev = process.env.REGISTER_INVITE_REQUIRED;
    process.env.REGISTER_INVITE_REQUIRED = 'true';
    const { prisma } = buildPrisma({ plans: { FREE: { id: 'p_free', name: 'FREE', price: 0 } } });
    const auth = buildAuth(prisma);
    await assert.rejects(
      () => auth.register({ email: 'a@b.com', password: 'pass123456', name: 'U' }),
      (e: any) => e instanceof BadRequestException && /请填写邀请码/.test(e.message),
    );
    process.env.REGISTER_INVITE_REQUIRED = prev;
  });

  test('有效 ADMIN_INVITE → 注册成功 + 原子消费 usedCount，无奖励(仍为 7 天)', async () => {
    const { prisma, calls } = buildPrisma({
      plans: { FREE: { id: 'p_free', name: 'FREE', price: 0 } },
      inviteCodes: { ADMIN1: { id: 'c1', code: 'ADMIN1', type: 'ADMIN_INVITE', maxUses: 1, usedCount: 0, expiresAt: null, createdBy: null } },
    });
    const auth = buildAuth(prisma);
    const res = await auth.register({ email: 'ok@b.com', password: 'pass123456', name: 'U', inviteCode: 'ADMIN1' });
    assert.ok(res.accessToken);
    assert.equal(calls.updateMany.length, 1, '应原子消费邀请码');
    const sub = calls.subCreate[0];
    const dur = (sub.expireAt - sub.startAt) / DAY;
    assert.ok(Math.abs(dur - 7) < 0.001, `ADMIN_INVITE 无奖励，应为 7 天，实际 ${dur}`);
  });

  test('ADMIN_INVITE 已用完 → 拒绝 邀请码已被使用完', async () => {
    const { prisma } = buildPrisma({
      plans: { FREE: { id: 'p_free', name: 'FREE', price: 0 } },
      inviteCodes: { ADMIN1: { id: 'c1', code: 'ADMIN1', type: 'ADMIN_INVITE', maxUses: 1, usedCount: 1, expiresAt: null, createdBy: null } },
    });
    const auth = buildAuth(prisma);
    await assert.rejects(
      () => auth.register({ email: 'x@b.com', password: 'pass123456', name: 'U', inviteCode: 'ADMIN1' }),
      (e: any) => /邀请码已被使用完/.test(e.message),
    );
  });

  test('类型混用：把 USER_REFERRAL 码当 inviteCode → 拒绝', async () => {
    const prev = process.env.REGISTER_INVITE_REQUIRED;
    process.env.REGISTER_INVITE_REQUIRED = 'false';
    const { prisma } = buildPrisma({
      plans: { FREE: { id: 'p_free', name: 'FREE', price: 0 } },
      inviteCodes: { REF1: { id: 'c2', code: 'REF1', type: 'USER_REFERRAL', maxUses: 1000, usedCount: 0, expiresAt: null, createdBy: 'u_inv' } },
    });
    const auth = buildAuth(prisma);
    await assert.rejects(
      () => auth.register({ email: 'm@b.com', password: 'pass123456', name: 'U', inviteCode: 'REF1' }),
      (e: any) => /邀请码无效或已过期/.test(e.message),
    );
    process.env.REGISTER_INVITE_REQUIRED = prev;
  });
});

describe('GROWTH-STAFF-05: 裂变奖励 (USER_REFERRAL)', () => {
  test('使用 referralCode → 被邀请人 10 天 + 邀请人 +3 天 + ReferralUse', async () => {
    const { prisma, calls } = withReferralState();
    const auth = buildAuth(prisma);
    const res = await auth.register({ email: 'invitee@b.com', password: 'pass123456', name: 'U', referralCode: 'REF1' });
    assert.ok(res.accessToken);

    const inviteeSub = calls.subCreate.find((s: any) => s.tenantId === 't_new');
    assert.ok(inviteeSub, '应创建被邀请人订阅');
    const dur = (inviteeSub.expireAt - inviteeSub.startAt) / DAY;
    assert.ok(Math.abs(dur - 10) < 0.001, `应为 10 天（7+3），实际 ${dur}`);

    assert.equal(calls.referralUseCreate.length, 1, '应写入一条 ReferralUse');
    const ru = calls.referralUseCreate[0];
    assert.equal(ru.referralCodeId, 'c1');
    assert.equal(ru.inviterUserId, 'u_inv');
    assert.ok(ru.usedByUserId.startsWith('u_new'), 'usedByUserId 应为新注册用户');
    assert.equal(ru.rewardDays, 3);
    assert.equal(ru.rewardStatus, 'APPLIED');

    assert.equal(calls.executeRaw.length, 1, '应原子延长邀请人订阅');
  });

  test('referralCode 过期 → 拒绝', async () => {
    const { prisma } = withReferralState();
    prisma.inviteCode.findUnique = async () => ({
      id: 'c1', code: 'REF1', type: 'USER_REFERRAL', maxUses: 1000, usedCount: 0, expiresAt: new Date(Date.now() - 1000), createdBy: 'u_inv',
    });
    const auth = buildAuth(prisma);
    await assert.rejects(
      () => auth.register({ email: 'e@b.com', password: 'pass123456', name: 'U', referralCode: 'REF1' }),
      (e: any) => /推荐码无效或已失效/.test(e.message),
    );
  });

  test('类型混用：把 ADMIN_INVITE 码当 referralCode → 拒绝', async () => {
    const { prisma } = buildPrisma({
      plans: { FREE: { id: 'p_free', name: 'FREE', price: 0 } },
      inviteCodes: { ADMIN1: { id: 'c3', code: 'ADMIN1', type: 'ADMIN_INVITE', maxUses: 1, usedCount: 0, expiresAt: null, createdBy: null } },
    });
    const auth = buildAuth(prisma);
    await assert.rejects(
      () => auth.register({ email: 'mm@b.com', password: 'pass123456', name: 'U', referralCode: 'ADMIN1' }),
      (e: any) => /推荐码无效或已失效/.test(e.message),
    );
  });

  test('同一被邀请人重复消费同码 → 唯一约束 + 事务回滚，不重复奖励', async () => {
    const { prisma, calls } = withReferralState({ fixedUserId: 'u_new' });
    const auth = buildAuth(prisma);
    const r1 = await auth.register({ email: 'a1@b.com', password: 'pass123456', name: 'U', referralCode: 'REF1' });
    assert.ok(r1.accessToken);
    const execBefore = calls.executeRaw.length;
    await assert.rejects(() => auth.register({ email: 'a2@b.com', password: 'pass123456', name: 'U', referralCode: 'REF1' }));
    // 第二次因唯一约束回滚，不应再延长邀请人
    assert.equal(calls.executeRaw.length, execBefore, '回滚后不应重复延长邀请人订阅');
  });
});

describe('GROWTH-STAFF-05: 用户自己的 referral code', () => {
  function buildInvite(prisma: any) {
    return new InviteCodesService(prisma, { get: () => undefined } as any);
  }

  function makePrisma(created: any[]) {
    return {
      inviteCode: {
        findFirst: async ({ where }: any) => created.find((c) => c.type === where.type && c.createdBy === where.createdBy) ?? null,
        findUnique: async ({ where }: any) => created.find((c) => c.code === where.code) ?? null,
        create: async (d: any) => { const rec = { id: 'ic_' + created.length, ...d.data }; created.push(rec); return rec; },
      },
      auditLog: { create: async () => ({}) },
    } as any;
  }

  test('首次获取创建，再次获取返回相同 code', async () => {
    const created: any[] = [];
    const svc = buildInvite(makePrisma(created));
    const r1: any = await svc.getOrCreateUserReferralCode('u1', 't1');
    assert.ok(r1.code, '应返回 code');
    assert.match(r1.code, /^[A-Z2-9]{8}$/, 'code 格式 8 位大写字母+数字，排除 0O1Il');
    assert.equal(r1.type, 'USER_REFERRAL');
    const r2: any = await svc.getOrCreateUserReferralCode('u1', 't1');
    assert.equal(r2.code, r1.code, '再次获取应返回相同 code');
    assert.equal(created.length, 1, '只应创建一次');
  });

  test('不同用户各自拥有独立 code', async () => {
    const created: any[] = [];
    const svc = buildInvite(makePrisma(created));
    const a: any = await svc.getOrCreateUserReferralCode('uA', 'tA');
    const b: any = await svc.getOrCreateUserReferralCode('uB', 'tB');
    assert.notEqual(a.code, b.code);
  });
});
