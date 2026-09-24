/**
 * L2 — 注册邀请码（Invite Code）集成测试（REAL database）。
 *
 * 覆盖：
 *  1. 注册无码 → 拒绝「请填写邀请码」
 *  2. 无效码 → 拒绝「邀请码无效或已过期」
 *  3. 有效码注册成功 + usedCount+1
 *  4. 单次码二次使用 → 拒绝「邀请码已被使用完」
 *  5. 并发同码（Promise.all 10）→ 仅 1 个成功（事务+原子条件更新）
 *  6. open 模式（REGISTER_INVITE_REQUIRED=false）→ 无码可注册
 *  7. 管理端：生成 / 列表 / 停用（admin key 校验）
 *  8. 码格式：8 位大写字母+数字，排除 0O1Il
 *
 * Run: npx ts-node src/auth/invite-code.integration.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { InviteCodesService } from '../admin/invite-codes.service';

const prisma = new PrismaClient();
const jwtService = new JwtService({ secret: 'l2-test-jwt-secret' });
const auditService = new AuditService(prisma as never);

/** 测试专用 admin key（非生产凭据） */
const TEST_ADMIN_KEY = 'l2-test-admin-key-7f3a';

const mockConfig = {
  get: (key: string) =>
    key === 'PAYMENT_ADMIN_KEY' || key === 'REGISTER_ADMIN_KEY'
      ? TEST_ADMIN_KEY
      : undefined,
} as unknown as ConfigService;

const createdTenantIds: string[] = [];
const createdCodeIds: string[] = [];

function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
}

function buildAuth(): AuthService {
  return new AuthService(prisma as never, jwtService, auditService);
}

function buildInviteService(): InviteCodesService {
  return new InviteCodesService(prisma as never, mockConfig);
}

async function createDirectCode(opts: {
  maxUses?: number;
  expiresAt?: Date | null;
} = {}) {
  const rec = await prisma.inviteCode.create({
    data: {
      code: `T${Math.random().toString(36).slice(2, 9).toUpperCase().replace(/[^A-Z2-9]/g, 'X')}`,
      maxUses: opts.maxUses ?? 1,
      expiresAt: opts.expiresAt === undefined ? null : opts.expiresAt,
    },
  });
  createdCodeIds.push(rec.id);
  return rec;
}

async function expectBadRequest(promise: Promise<unknown>, msgPart: string) {
  await assert.rejects(
    promise,
    (err: any) => {
      assert.ok(err, 'expected an error');
      const message =
        typeof err?.response?.message === 'string'
          ? err.response.message
          : err?.message ?? '';
      assert.match(message, new RegExp(msgPart), `expected message to contain ${msgPart}, got: ${message}`);
      return true;
    },
  );
}

/** NestJS 异常状态码提取（兼容 exception.getStatus / err.response / err.status） */
function statusOf(err: any): number | undefined {
  if (typeof err?.getStatus === 'function') return err.getStatus();
  if (err?.response?.statusCode) return err.response.statusCode;
  if (err?.status) return err.status;
  return undefined;
}

before(() => {
  process.env.REGISTER_INVITE_REQUIRED = 'true';
});

after(async () => {
  // 清理：删除邀请码 + 测试租户（AuditLog 随 tenant 级联删除）
  await prisma.inviteCode.deleteMany({ where: { id: { in: createdCodeIds } } }).catch(() => undefined);
  for (const tenantId of createdTenantIds) {
    await prisma.subscription.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

async function registerTracked(auth: AuthService, email: string, inviteCode?: string) {
  const res = await auth.register({ email, password: 'pass123456', name: 'L2 User', inviteCode });
  const user = await prisma.user.findUnique({ where: { id: res.user.id } });
  createdTenantIds.push(user!.tenantId);
  return res;
}

/* ------------------------------------------------------------------ */
/* 1. 注册无码 → 拒绝                                                   */
/* ------------------------------------------------------------------ */

test('L2: 注册无码被拒绝（REGISTER_INVITE_REQUIRED=true）', async () => {
  const auth = buildAuth();
  await expectBadRequest(
    auth.register({ email: uniqueEmail('nokey'), password: 'pass123456', name: 'X' }),
    '请填写邀请码',
  );
});

/* ------------------------------------------------------------------ */
/* 2. 无效码 → 拒绝                                                     */
/* ------------------------------------------------------------------ */

test('L2: 无效邀请码被拒绝', async () => {
  const auth = buildAuth();
  await expectBadRequest(
    auth.register({ email: uniqueEmail('badcode'), password: 'pass123456', name: 'X', inviteCode: 'ZZZZZZZZ' }),
    '邀请码无效或已过期',
  );
});

test('L2: 已过期邀请码被拒绝', async () => {
  const rec = await createDirectCode({ expiresAt: new Date(Date.now() - 1000) });
  const auth = buildAuth();
  await expectBadRequest(
    auth.register({ email: uniqueEmail('expired'), password: 'pass123456', name: 'X', inviteCode: rec.code }),
    '邀请码无效或已过期',
  );
});

/* ------------------------------------------------------------------ */
/* 3. 有效码注册成功 + usedCount+1                                      */
/* ------------------------------------------------------------------ */

test('L2: 有效码注册成功且 usedCount 递增', async () => {
  const rec = await createDirectCode({ maxUses: 3 });
  const auth = buildAuth();
  await registerTracked(auth, uniqueEmail('ok'), rec.code);

  const afterReg = await prisma.inviteCode.findUnique({ where: { id: rec.id } });
  assert.equal(afterReg!.usedCount, 1, 'usedCount 必须 +1');
});

/* ------------------------------------------------------------------ */
/* 4. 单次码二次使用 → 拒绝                                              */
/* ------------------------------------------------------------------ */

test('L2: 单次码（maxUses=1）二次使用被拒绝', async () => {
  const rec = await createDirectCode({ maxUses: 1 });
  const auth = buildAuth();
  await registerTracked(auth, uniqueEmail('once1'), rec.code);
  await expectBadRequest(
    auth.register({ email: uniqueEmail('once2'), password: 'pass123456', name: 'X', inviteCode: rec.code }),
    '邀请码已被使用完',
  );
});

/* ------------------------------------------------------------------ */
/* 5. 并发同码 → 仅 1 个成功（事务保证）                                  */
/* ------------------------------------------------------------------ */

test('L2: 并发注册同一码仅 1 个成功', async () => {
  const rec = await createDirectCode({ maxUses: 1 });
  const auth = buildAuth();
  const attempts = Array.from({ length: 10 }, () =>
    auth
      .register({ email: uniqueEmail('race'), password: 'pass123456', name: 'X', inviteCode: rec.code })
      .then(() => 'ok')
      .catch((e: any) => (e?.response?.statusCode === 400 ? 'rejected' : `err:${e?.message}`)),
  );
  const results = await Promise.all(attempts);
  const okCount = results.filter((r) => r === 'ok').length;
  assert.equal(okCount, 1, `期望 1 个成功，实际 ${okCount}（结果: ${results.join(',')}）`);
  const final = await prisma.inviteCode.findUnique({ where: { id: rec.id } });
  assert.equal(final!.usedCount, 1, 'usedCount 必须为 1');
});

/* ------------------------------------------------------------------ */
/* 6. open 模式 → 无码可注册                                            */
/* ------------------------------------------------------------------ */

test('L2: open 模式（REGISTER_INVITE_REQUIRED=false）无码可注册', async () => {
  process.env.REGISTER_INVITE_REQUIRED = 'false';
  try {
    const auth = buildAuth();
    await registerTracked(auth, uniqueEmail('open'));
  } finally {
    process.env.REGISTER_INVITE_REQUIRED = 'true';
  }
});

/* ------------------------------------------------------------------ */
/* 7. 管理端：生成 / 列表 / 停用（admin key）                             */
/* ------------------------------------------------------------------ */

test('L2: 管理端生成邀请码（错误 key 拒绝）', async () => {
  const svc = buildInviteService();
  await assert.rejects(
    svc.generate({ count: 1 }, 'wrong-key'),
    (err: any) => statusOf(err) === 401,
  );

  const gen = await svc.generate(
    { count: 2, maxUses: 5, remark: '给客户A', expiresInDays: 30 },
    TEST_ADMIN_KEY,
  );
  assert.equal(gen.items.length, 2);
  for (const item of gen.items) {
    assert.match(item.code, /^[A-Z2-9]{8}$/, `码格式错误: ${item.code}`);
    assert.ok(!/[0O1Il]/.test(item.code), `码包含易混字符: ${item.code}`);
    assert.equal(item.maxUses, 5);
    assert.ok(item.expiresAt > new Date());
  }
  createdCodeIds.push(
    ...(await prisma.inviteCode.findMany({
      where: { code: { in: gen.items.map((i) => i.code) } },
      select: { id: true },
    })).map((r) => r.id),
  );
});

test('L2: 管理端列表返回剩余次数', async () => {
  const rec = await createDirectCode({ maxUses: 3 });
  const svc = buildInviteService();
  const list = await svc.list(TEST_ADMIN_KEY);
  const found = list.items.find((i) => i.id === rec.id);
  assert.ok(found, '列表应包含刚创建的码');
  assert.equal(found!.maxUses, 3);
  assert.equal(found!.remaining, 3);

  await assert.rejects(
    svc.list('wrong-key'),
    (err: any) => statusOf(err) === 401,
  );
});

test('L2: 管理端停用后该码不可再注册', async () => {
  const rec = await createDirectCode({ maxUses: 5 });
  const svc = buildInviteService();
  const revoked = await svc.revoke(rec.code, TEST_ADMIN_KEY);
  assert.equal(revoked.revoked, true);

  const auth = buildAuth();
  await expectBadRequest(
    auth.register({ email: uniqueEmail('revoked'), password: 'pass123456', name: 'X', inviteCode: rec.code }),
    '邀请码无效或已过期',
  );

  await assert.rejects(
    svc.revoke(rec.code, 'wrong-key'),
    (err: any) => statusOf(err) === 401,
  );
});

/* ------------------------------------------------------------------ */
/* 8. 码格式（单元性质：crypto 随机 + 排除易混字符）                       */
/* ------------------------------------------------------------------ */

test('L2: 生成码 8 位大写字母+数字且排除 0O1Il', async () => {
  const svc = buildInviteService();
  const gen = await svc.generate({ count: 50, expiresInDays: 7 }, TEST_ADMIN_KEY);
  assert.equal(gen.items.length, 50);
  const unique = new Set(gen.items.map((i) => i.code));
  assert.equal(unique.size, 50, '50 个码必须互不重复');
  for (const item of gen.items) {
    assert.equal(item.code.length, 8);
    assert.match(item.code, /^[A-Z2-9]{8}$/);
    assert.ok(!/[0O1Il]/.test(item.code));
  }
  createdCodeIds.push(
    ...(await prisma.inviteCode.findMany({
      where: { code: { in: gen.items.map((i) => i.code) } },
      select: { id: true },
    })).map((r) => r.id),
  );
});
