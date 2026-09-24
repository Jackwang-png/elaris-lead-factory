/**
 * P0-4 Production Hardening 测试套件（纯单元测试，不触碰生产 DB）。
 *
 * 覆盖：
 *   1. TenantApiKey 生命周期：create / listSafe / revoke / activate /
 *      cross-tenant revoke / revoked key rejected / expired key rejected
 *   2. WorkforceTenantGuard：有效 key / revoked / expired / scope / JWT
 *   3. Approval 生命周期：request / approve / reject / duplicate approve /
 *      approve rejected / approve expired / cross-tenant / reject without reason /
 *      EXECUTING→EXECUTED / cancel / list 筛选
 *   4. Compliance：low→allowed / medium→approval / high→human-only /
 *      outreach→high / bulk outreach→high
 *   5. Rate Limit：正常通过 / 超限 429 / 不同 tenant 互不影响
 *
 * Run: npx ts-node src/workforce/workforce-p04.test.ts
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

import {
  TenantApiKeyService,
  ALLOWED_API_KEY_SCOPES,
} from './services/tenant-api-key.service';
import { WorkforceAuditService } from './services/workforce-audit.service';
import { WorkforceTenantGuard } from './workforce-tenant.guard';
import { WorkforceThrottlerGuard } from './workforce-throttler.guard';
import { ApprovalService } from './services/approval.service';
import { ComplianceService } from './services/compliance.service';
import { HumanControlService } from './services/human-control.service';
import { WORKFORCE_SCOPE_KEY, WORKFORCE_JWT_ONLY_KEY } from './workforce.types';

// ---------------------------------------------------------------------------
// Fake Prisma（内存版，足够支撑本套件全部服务）
// ---------------------------------------------------------------------------

type Row = any;

function matchesWhere(row: Row, where: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // 支持 { contains } / { gte } 等简单操作符
      if ('contains' in v) {
        const target = String(row[k] ?? '');
        if (!target.toLowerCase().includes(String(v.contains).toLowerCase())) return false;
        continue;
      }
      if ('gte' in v) {
        if (row[k] < v.gte) return false;
        continue;
      }
      if ('lte' in v) {
        if (row[k] > v.lte) return false;
        continue;
      }
    }
    if (row[k] !== v) return false;
  }
  return true;
}

class FakePrisma {
  tenantApiKeyRows: Row[] = [];
  auditLogRows: Row[] = [];
  userRows: Row[] = [];

  tenantApiKey = {
    create: async (args: any) => {
      const row = { id: `key-${this.tenantApiKeyRows.length + 1}`, lastUsedAt: null, ...args.data, createdAt: new Date() };
      this.tenantApiKeyRows.push(row);
      return row;
    },
    findUnique: async (args: any) =>
      this.tenantApiKeyRows.find((r) => r[Object.keys(args.where)[0]] === Object.values(args.where)[0]) || null,
    findFirst: async (args: any) =>
      this.tenantApiKeyRows.find((r) => matchesWhere(r, args.where)) || null,
    findMany: async (args: any) =>
      this.tenantApiKeyRows.filter((r) => matchesWhere(r, args.where || {})),
    update: async (args: any) => {
      const idx = this.tenantApiKeyRows.findIndex((r) => r.id === args.where.id);
      if (idx < 0) throw new Error('not found');
      this.tenantApiKeyRows[idx] = { ...this.tenantApiKeyRows[idx], ...args.data, updatedAt: new Date() };
      return this.tenantApiKeyRows[idx];
    },
  };

  auditLog = {
    create: async (args: any) => {
      const row = { id: `audit-${this.auditLogRows.length + 1}`, ...args.data, createdAt: new Date(), updatedAt: new Date() };
      this.auditLogRows.push(row);
      return row;
    },
    findMany: async (args: any) => {
      let rows = this.auditLogRows.filter((r) => matchesWhere(r, args.where || {}));
      if (args.orderBy?.createdAt === 'desc') {
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return rows;
    },
  };

  user = {
    findUnique: async (args: any) =>
      this.userRows.find((r) => r[Object.keys(args.where)[0]] === Object.values(args.where)[0]) || null,
  };
}

// ---------------------------------------------------------------------------
// 公共工具
// ---------------------------------------------------------------------------

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function makeCtx(headers: Record<string, string> = {}, meta: { scopes?: string[]; jwtOnly?: boolean } = {}) {
  const handler = () => undefined;
  const cls = class TestController {};
  if (meta.scopes) Reflect.defineMetadata(WORKFORCE_SCOPE_KEY, meta.scopes, handler);
  if (meta.jwtOnly) Reflect.defineMetadata(WORKFORCE_JWT_ONLY_KEY, meta.jwtOnly, handler);
  const req: any = { headers, ip: '127.0.0.1' };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
    __req: req,
  } as unknown as ExecutionContext & { __req: any };
}

const jwtSecret = 'test-secret-key';
const jwt = new JwtService({ secret: jwtSecret });
const signUser = (sub: string) => jwt.sign({ sub }, { expiresIn: '1h' });

function userCtx(tenantId: string, userId = 'u-admin'): any {
  return {
    mode: 'jwt',
    tenantId,
    userId,
    scopes: ['*'],
    actorType: 'USER',
    source: 'jwt',
    traceId: 'trace-admin',
    ip: '127.0.0.1',
  };
}

function serviceCtx(tenantId: string, source = 'scout', traceId = 'trace-chain-1'): any {
  return {
    mode: 'api_key',
    tenantId,
    scopes: ['*'],
    actorType: 'SERVICE',
    source,
    traceId,
    ip: '127.0.0.1',
  };
}

function buildApiKeyService(fake: FakePrisma) {
  const audit = new WorkforceAuditService(fake as any);
  return new TenantApiKeyService(fake as any, audit);
}

function buildApprovalService(fake: FakePrisma) {
  const audit = new WorkforceAuditService(fake as any);
  return new ApprovalService(fake as any, audit);
}

// ===========================================================================
// 1) TenantApiKey 生命周期
// ===========================================================================

test('P0-4.1: create 返回明文一次，DB 只存 sha256 hash + prefix + active', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);

  const result = await svc.create('tenant-1', { name: 'scout-key', scopes: ['signals:write', 'hacker:scope'] }, userCtx('tenant-1'));

  assert.ok(result.key.startsWith('sc_'));
  assert.equal(result.keyPrefix, `${result.key.slice(0, 11)}...${result.key.slice(-4)}`);
  assert.equal(result.status, 'active');

  const stored = fake.tenantApiKeyRows[0];
  assert.equal(stored.keyHash, sha256(result.key));
  assert.notEqual(stored.keyHash, result.key);
  assert.ok(!stored.key); // 明文永不落库
  assert.deepEqual(stored.scopes, ['signals:write']); // 非法 scope 被过滤
  assert.equal(stored.tenantId, 'tenant-1');

  // 审计
  const auditRow = fake.auditLogRows[0];
  assert.equal(auditRow.action, 'TENANT_API_KEY_CREATE');
  assert.equal(auditRow.tenantId, 'tenant-1');
  assert.ok(!JSON.stringify(auditRow).includes(result.key)); // 明文不进审计
});

test('P0-4.1: listSafe 只暴露 id/prefix/scopes/active/expiresAt/createdAt/lastUsedAt', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1', scopes: ['leads:read'] }, userCtx('tenant-1'));

  const list = await svc.listSafe('tenant-1');
  assert.equal(list.length, 1);
  const item = list[0];
  assert.equal(item.id, created.id);
  assert.equal(item.prefix, created.keyPrefix);
  assert.equal(item.active, true);
  assert.deepEqual(item.scopes, ['leads:read']);
  assert.ok(item.createdAt);
  assert.ok(item.lastUsedAt === null || item.lastUsedAt instanceof Date);
  assert.ok(!('key' in item));
  assert.ok(!('keyHash' in item));
  assert.ok(!JSON.stringify(item).includes(created.key));
});

test('P0-4.1: revoke 置 status=revoked + 审计 API_KEY_REVOKED；幂等', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1' }, userCtx('tenant-1'));

  const revoked = await svc.revoke('tenant-1', created.id, userCtx('tenant-1'), 'compromised');
  assert.equal(revoked.active, false);
  assert.equal(revoked.status, 'revoked');
  assert.equal(fake.tenantApiKeyRows[0].status, 'revoked');

  const auditActions = fake.auditLogRows.map((r) => r.action);
  assert.ok(auditActions.includes('API_KEY_REVOKED'));
  const revokeRow = fake.auditLogRows.find((r) => r.action === 'API_KEY_REVOKED');
  assert.equal(revokeRow.tenantId, 'tenant-1');
  assert.equal(revokeRow.resourceId, created.id);
  assert.equal(revokeRow.traceId, 'trace-admin');
  assert.equal(revokeRow.actorType, 'USER');

  // 幂等：再次 revoke 不再追加审计
  const before = fake.auditLogRows.length;
  await svc.revoke('tenant-1', created.id, userCtx('tenant-1'));
  assert.equal(fake.auditLogRows.length, before);
});

test('P0-4.1: cross-tenant revoke → 404（不泄露存在性）', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1' }, userCtx('tenant-1'));

  await assert.rejects(
    svc.revoke('tenant-2', created.id, userCtx('tenant-2')),
    (e: any) => e.status === 404,
  );
  assert.equal(fake.tenantApiKeyRows[0].status, 'active'); // 未受影响
});

test('P0-4.1: activate 恢复 active + 审计 API_KEY_ACTIVATED', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1' }, userCtx('tenant-1'));
  await svc.revoke('tenant-1', created.id, userCtx('tenant-1'));

  const activated = await svc.activate('tenant-1', created.id, userCtx('tenant-1'), 'rotation');
  assert.equal(activated.active, true);
  assert.equal(activated.status, 'active');

  const actions = fake.auditLogRows.map((r) => r.action);
  assert.ok(actions.includes('API_KEY_ACTIVATED'));
  const row = fake.auditLogRows.find((r) => r.action === 'API_KEY_ACTIVATED');
  assert.equal(row.tenantId, 'tenant-1');
  assert.equal(row.resourceId, created.id);
  assert.equal(row.actorType, 'USER');
});

test('P0-4.1: ALLOWED_API_KEY_SCOPES 含 approvals:read/approvals:write', () => {
  assert.ok(ALLOWED_API_KEY_SCOPES.includes('approvals:read'));
  assert.ok(ALLOWED_API_KEY_SCOPES.includes('approvals:write'));
});

// ===========================================================================
// 2) WorkforceTenantGuard（鉴权 + 生命周期即时生效）
// ===========================================================================

function buildGuard(fake: FakePrisma) {
  return new WorkforceTenantGuard(new Reflector(), fake as any, jwt);
}

test('P0-4.1: 有效 X-Tenant-Key → ctx.tenantId/scopes/actorType=SERVICE', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'scout', scopes: ['signals:write', 'audit:read'] }, userCtx('tenant-1'));
  const guard = buildGuard(fake);

  const ctx = makeCtx({ 'x-tenant-key': created.key }, { scopes: ['signals:write'] });
  const ok = await guard.canActivate(ctx);
  assert.equal(ok, true);
  assert.equal(ctx.__req.workforceContext.tenantId, 'tenant-1');
  assert.equal(ctx.__req.workforceContext.actorType, 'SERVICE');
  assert.equal(ctx.__req.workforceContext.source, 'scout');
  assert.ok(ctx.__req.workforceContext.traceId);
});

test('P0-4.1: revoked key 立即失效 → 401', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1' }, userCtx('tenant-1'));
  await svc.revoke('tenant-1', created.id, userCtx('tenant-1'));
  const guard = buildGuard(fake);

  await assert.rejects(
    guard.canActivate(makeCtx({ 'x-tenant-key': created.key })),
    (e: any) => e.status === 401,
  );
});

test('P0-4.1: expired key → 401', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const past = new Date(Date.now() - 60_000).toISOString();
  const created = await svc.create('tenant-1', { name: 'k1', expiresAt: past }, userCtx('tenant-1'));
  const guard = buildGuard(fake);

  await assert.rejects(
    guard.canActivate(makeCtx({ 'x-tenant-key': created.key })),
    (e: any) => e.status === 401,
  );
});

test('P0-4.1: 缺少 scope → 403', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1', scopes: ['leads:read'] }, userCtx('tenant-1'));
  const guard = buildGuard(fake);

  await assert.rejects(
    guard.canActivate(makeCtx({ 'x-tenant-key': created.key }, { scopes: ['audit:read'] })),
    (e: any) => e.status === 403,
  );
});

test('P0-4.1: 无认证 → 401；JWT 有效 → ctx.actorType=USER', async () => {
  const fake = new FakePrisma();
  fake.userRows.push({ id: 'u-1', tenantId: 'tenant-1', email: 'a@b.c' });
  const guard = buildGuard(fake);

  await assert.rejects(guard.canActivate(makeCtx({})), (e: any) => e.status === 401);

  const ctx = makeCtx({ authorization: `Bearer ${signUser('u-1')}` });
  const ok = await guard.canActivate(ctx);
  assert.equal(ok, true);
  assert.equal(ctx.__req.workforceContext.tenantId, 'tenant-1');
  assert.equal(ctx.__req.workforceContext.actorType, 'USER');
  assert.equal(ctx.__req.workforceContext.userId, 'u-1');
});

test('P0-4.1: JwtOnly 接口拒绝 api_key 模式 → 403', async () => {
  const fake = new FakePrisma();
  const svc = buildApiKeyService(fake);
  const created = await svc.create('tenant-1', { name: 'k1', scopes: ['*'] }, userCtx('tenant-1'));
  const guard = buildGuard(fake);

  await assert.rejects(
    guard.canActivate(makeCtx({ 'x-tenant-key': created.key }, { jwtOnly: true })),
    (e: any) => e.status === 403,
  );
});

// ===========================================================================
// 3) Approval 生命周期
// ===========================================================================

test('P0-4.4: request → PENDING_APPROVAL + APPROVAL_CREATED 审计（含 traceId/tenantId/actorType/source）', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);

  const rec = await svc.request({
    tenantId: 'tenant-1',
    action: 'HUNTER_QUALIFIED',
    targetType: 'Lead',
    targetId: 'lead-1',
    riskLevel: 'medium',
    reason: 'business decision requires approval',
    traceId: 'trace-chain-1',
    requestedBy: undefined,
    source: 'hunter',
    actorType: 'AI_EMPLOYEE',
  });

  assert.ok(rec.approvalId);
  assert.equal(rec.status, 'PENDING_APPROVAL');
  assert.equal(rec.riskLevel, 'medium');
  assert.equal(rec.traceId, 'trace-chain-1');
  assert.equal(rec.seq, 0);

  const row = fake.auditLogRows[0];
  assert.equal(row.action, 'APPROVAL_CREATED');
  assert.equal(row.resource, 'Approval');
  assert.equal(row.resourceId, rec.approvalId);
  assert.equal(row.tenantId, 'tenant-1');
  assert.equal(row.traceId, 'trace-chain-1');
  assert.equal(row.actorType, 'AI_EMPLOYEE');
  assert.equal(row.source, 'hunter');
  assert.equal(row.detail.approvalId, rec.approvalId);
});

test('P0-4.4: approve → APPROVED（approvedAt/approvedBy）+ 审计，traceId 延续原链路', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 'trace-chain-1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });

  const approved = await svc.approve('tenant-1', rec.approvalId, userCtx('tenant-1', 'u-approver'));
  assert.equal(approved.status, 'APPROVED');
  assert.ok(approved.approvedAt);
  assert.equal(approved.approvedBy, 'u-approver');
  assert.equal(approved.approverTraceId, 'trace-admin');
  assert.equal(approved.traceId, 'trace-chain-1'); // 链路不变

  const row = fake.auditLogRows[1];
  assert.equal(row.action, 'APPROVAL_APPROVED');
  assert.equal(row.traceId, 'trace-chain-1'); // 链路不变
  assert.equal(row.actorType, 'USER'); // 操作者（审批人）
  assert.equal(row.source, 'hunter'); // 链路来源不变
  assert.equal(row.detail.approverTraceId, 'trace-admin');
});

test('P0-4.4: duplicate approve → 409', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });
  await svc.approve('tenant-1', rec.approvalId, userCtx('tenant-1'));

  await assert.rejects(
    svc.approve('tenant-1', rec.approvalId, userCtx('tenant-1')),
    (e: any) => e.status === 409,
  );
});

test('P0-4.4: reject without reason → 400', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });

  await assert.rejects(
    svc.reject('tenant-1', rec.approvalId, '', userCtx('tenant-1')),
    (e: any) => e.status === 400,
  );
});

test('P0-4.4: reject → REJECTED（rejectedAt/rejectedBy/reason）+ 审计', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'high', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });

  const rejected = await svc.reject('tenant-1', rec.approvalId, 'duplicate lead', userCtx('tenant-1', 'u-approver'));
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.reason, 'duplicate lead');
  assert.equal(rejected.rejectedBy, 'u-approver');
  assert.ok(rejected.rejectedAt);

  const row = fake.auditLogRows[1];
  assert.equal(row.action, 'APPROVAL_REJECTED');
  assert.equal(row.detail.reason, 'duplicate lead');
  assert.equal(row.traceId, 't1');
});

test('P0-4.4: approve rejected item → 409；reject approved item → 409', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const req = () =>
    svc.request({
      tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-x',
      riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
    });

  const a = await req();
  await svc.reject('tenant-1', a.approvalId, 'no', userCtx('tenant-1'));
  await assert.rejects(svc.approve('tenant-1', a.approvalId, userCtx('tenant-1')), (e: any) => e.status === 409);

  const b = await req();
  await svc.approve('tenant-1', b.approvalId, userCtx('tenant-1'));
  await assert.rejects(svc.reject('tenant-1', b.approvalId, 'late', userCtx('tenant-1')), (e: any) => e.status === 409);
});

test('P0-4.4: approve expired item → 自动 EXPIRED + 409', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });

  await assert.rejects(svc.approve('tenant-1', rec.approvalId, userCtx('tenant-1')), (e: any) => e.status === 409);

  const actions = fake.auditLogRows.map((r) => r.action);
  assert.ok(actions.includes('APPROVAL_EXPIRED'));
  const byId = await svc.getById('tenant-1', rec.approvalId);
  assert.equal(byId.status, 'EXPIRED');
});

test('P0-4.4: cross-tenant approve/reject/get → 404', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });

  await assert.rejects(svc.approve('tenant-2', rec.approvalId, userCtx('tenant-2')), (e: any) => e.status === 404);
  await assert.rejects(svc.reject('tenant-2', rec.approvalId, 'x', userCtx('tenant-2')), (e: any) => e.status === 404);
  await assert.rejects(svc.getById('tenant-2', rec.approvalId), (e: any) => e.status === 404);
  assert.equal((await svc.getById('tenant-1', rec.approvalId)).status, 'PENDING_APPROVAL');
});

test('P0-4.4: 完整生命周期 PENDING→APPROVED→EXECUTING→EXECUTED', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'OUTREACH', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'high', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });

  const approved = await svc.approve('tenant-1', rec.approvalId, userCtx('tenant-1'));
  assert.equal(approved.status, 'APPROVED');

  const executing = await svc.markExecuting('tenant-1', rec.approvalId, serviceCtx('tenant-1', 'executor'));
  assert.equal(executing.status, 'EXECUTING');

  const executed = await svc.markExecuted('tenant-1', rec.approvalId, serviceCtx('tenant-1', 'executor'), { sent: 1 });
  assert.equal(executed.status, 'EXECUTED');
  assert.equal(executed.result.sent, 1);

  // 终态不可再变更
  await assert.rejects(svc.approve('tenant-1', rec.approvalId, userCtx('tenant-1')), (e: any) => e.status === 409);

  const actions = fake.auditLogRows.map((r) => r.action);
  assert.deepEqual(actions, [
    'APPROVAL_CREATED',
    'APPROVAL_APPROVED',
    'APPROVAL_EXECUTING',
    'APPROVAL_EXECUTED',
  ]);
  // 全部沿用同一 traceId
  assert.ok(fake.auditLogRows.every((r) => r.traceId === 't1'));
});

test('P0-4.4: cancel PENDING → CANCELLED；非 PENDING cancel → 409', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);
  const rec = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });

  const cancelled = await svc.cancel('tenant-1', rec.approvalId, userCtx('tenant-1'), 'no longer needed');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(fake.auditLogRows[1].action, 'APPROVAL_CANCELLED');

  const rec2 = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-2',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });
  await svc.approve('tenant-1', rec2.approvalId, userCtx('tenant-1'));
  await assert.rejects(svc.cancel('tenant-1', rec2.approvalId, userCtx('tenant-1')), (e: any) => e.status === 409);
});

test('P0-4.4: list 支持 status/action/riskLevel 筛选 + 分页', async () => {
  const fake = new FakePrisma();
  const svc = buildApprovalService(fake);

  const r1 = await svc.request({
    tenantId: 'tenant-1', action: 'HUNTER_QUEUE', targetType: 'Lead', targetId: 'lead-1',
    riskLevel: 'medium', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });
  const r2 = await svc.request({
    tenantId: 'tenant-1', action: 'OUTREACH', targetType: 'Lead', targetId: 'lead-2',
    riskLevel: 'high', traceId: 't1', source: 'hunter', actorType: 'AI_EMPLOYEE',
  });
  await svc.approve('tenant-1', r1.approvalId, userCtx('tenant-1'));

  const all = await svc.list('tenant-1', {});
  assert.equal(all.total, 2);

  const approvedOnly = await svc.list('tenant-1', { status: 'APPROVED' });
  assert.equal(approvedOnly.total, 1);
  assert.equal(approvedOnly.items[0].approvalId, r1.approvalId);

  const high = await svc.list('tenant-1', { riskLevel: 'high' });
  assert.equal(high.total, 1);
  assert.equal(high.items[0].approvalId, r2.approvalId);

  const actionFilter = await svc.list('tenant-1', { action: 'HUNTER_QUEUE' });
  assert.equal(actionFilter.total, 1);

  const page1 = await svc.list('tenant-1', { page: 1, limit: 1 });
  assert.equal(page1.items.length, 1);
  assert.equal(page1.total, 2);
  assert.equal(page1.totalPages, 2);

  // tenant 隔离
  const other = await svc.list('tenant-9', {});
  assert.equal(other.total, 0);
});

// ===========================================================================
// 4) Compliance Gate + Risk Policy
// ===========================================================================

test('P0-4.3: compliance —— verified 来源 → verified（auto allowed）', () => {
  const svc = new ComplianceService();
  assert.equal(svc.check({ credibility: 'verified' }).status, 'verified');
  // 内部更新（无来源声明）→ verified（low risk auto allowed）
  const r = svc.check({ action: 'internal_update' });
  assert.equal(r.status, 'verified');
  assert.ok(r.checks.includes('internal_update_auto_allowed'));
});

test('P0-4.3: compliance —— rejected 来源 → rejected（硬阻断）', () => {
  const svc = new ComplianceService();
  assert.equal(svc.check({ credibility: 'rejected' }).status, 'rejected');
});

test('P0-4.3: compliance —— 敏感信号类型 → rejected', () => {
  const svc = new ComplianceService();
  const r = svc.check({ signalType: 'purchased_list' });
  assert.equal(r.status, 'rejected');
  assert.ok(r.checks.some((c) => c.includes('sensitive_signal_type')));
});

test('P0-4.3: compliance —— outreach / bulk outreach → pending（需审批）', () => {
  const svc = new ComplianceService();
  assert.equal(svc.check({ action: 'external_contact' }).status, 'pending');
  assert.equal(svc.check({ action: 'bulk_outreach' }).status, 'pending');
  assert.equal(svc.check({ action: 'batch_operation' }).status, 'pending');
  assert.equal(svc.check({ action: 'outreach' }).status, 'pending');
});

test('P0-4.3: risk policy —— low→auto / medium→approval / high→human-only', () => {
  const svc = new HumanControlService({ get: () => undefined } as any);

  const low = svc.classify('LEAD_CREATE');
  assert.equal(low.level, 'low');
  assert.equal(low.mode, 'auto');

  const med = svc.classify('HUNTER_QUALIFIED');
  assert.equal(med.level, 'medium');
  assert.equal(med.mode, 'approval');

  const high = svc.classify('OUTREACH');
  assert.equal(high.level, 'high');
  assert.equal(high.mode, 'human-only');
});

test('P0-4.3: outreach→high / bulk outreach→high（含 payload 批量>1 与 payload.action）', () => {
  const svc = new HumanControlService({ get: () => undefined } as any);

  assert.equal(svc.classify('OUTREACH').level, 'high');
  assert.equal(svc.classify('BULK_OUTREACH').level, 'high');
  assert.equal(svc.classify('SEND_MESSAGE').level, 'high');
  assert.equal(svc.classify('HUNTER_QUEUE', { batch: 5 }).level, 'high');
  assert.equal(svc.classify('HUNTER_QUEUE', { channel: 'outbound' }).level, 'high');
  assert.equal(svc.classify('HUNTER_QUEUE', { action: 'outreach' }).level, 'high');
  assert.equal(svc.classify('HUNTER_QUEUE', { action: 'bulk_outreach' }).level, 'high');
  assert.equal(svc.classify('HUNTER_QUEUE', { batch: 1 }).level, 'medium');
});

test('P0-4.3: decide —— high 永远 human-only，即使 WORKFORCE_AUTO_APPROVE=true', () => {
  const auto = new HumanControlService({ get: (k: string) => (k === 'WORKFORCE_AUTO_APPROVE' ? 'true' : undefined) } as any);

  const d = auto.decide('OUTREACH', {});
  assert.equal(d.approvalRequired, true);
  assert.equal(d.autoApproved, false);
  assert.equal(d.decision.mode, 'human-only');
});

test('P0-4.3: decide —— HUNTER_AUTO_APPROVE=true 仅放行 medium（默认环境全 false）', () => {
  const prod = new HumanControlService({ get: () => undefined } as any);
  // 生产默认：无 AUTO_APPROVE 环境变量 → 全部需要审批
  assert.equal(prod.decide('HUNTER_QUEUE', {}).approvalRequired, true);
  assert.equal(prod.decide('HUNTER_QUALIFIED', {}).approvalRequired, true);

  const dev = new HumanControlService({ get: (k: string) => (k === 'HUNTER_AUTO_APPROVE' ? 'true' : undefined) } as any);
  assert.equal(dev.decide('HUNTER_QUEUE', {}).approvalRequired, false);
  assert.equal(dev.decide('HUNTER_QUEUE', {}).autoApproved, true);
  // 但 high 仍不被放行
  assert.equal(dev.decide('OUTREACH', {}).approvalRequired, true);
});

// ---------------------------------------------------------------------------
// 5) Rate Limit 工具：内存 ThrottlerStorage + 手动装配 guard
// ---------------------------------------------------------------------------

class MemThrottlerStorage implements ThrottlerStorage {
  private map = new Map<string, { hits: number; expireAt: number; blockedUntil: number }>();

  async increment(
    key: string,
    ttl: number,
    _limit: number,
    blockDuration: number,
    _throttlerName: string,
  ) {
    const now = Date.now();
    let rec = this.map.get(key);
    if (!rec || rec.expireAt <= now) {
      rec = { hits: 0, expireAt: now + ttl, blockedUntil: 0 };
      this.map.set(key, rec);
    }
    rec.hits++;
    const isBlocked = rec.hits > _limit || rec.blockedUntil > now;
    if (isBlocked && rec.blockedUntil <= now) {
      rec.blockedUntil = now + blockDuration;
    }
    return {
      totalHits: rec.hits,
      timeToExpire: Math.max(0, rec.expireAt - now),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.max(0, rec.blockedUntil - now) : 0,
    };
  }
}

function buildThrottlerEnv(limit: number) {
  const guard = new WorkforceThrottlerGuard(
    [{ name: 'default', ttl: 60_000, limit }],
    new MemThrottlerStorage(),
    new Reflector(),
  );
  return guard;
}

function throttledCtx(tenantId?: string) {
  const handler = () => undefined;
  const cls = class RL {};
  const req: any = {
    ip: '9.9.9.9',
    headers: {},
    workforceContext: tenantId ? { tenantId } : undefined,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ header: () => undefined }),
    }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

function throttleErrorBody(e: any) {
  const resp = e.getResponse?.() || {};
  return resp as { statusCode?: number; message?: string; error?: string };
}


test('P0-4.2: 限流 —— 限额内通过；超限 429；不同 tenant 互不影响', async () => {
  const guard = buildThrottlerEnv(3);
  await guard.onModuleInit();

  // tenant-1：前 3 次通过
  for (let i = 0; i < 3; i++) {
    assert.equal(await guard.canActivate(throttledCtx('tenant-1')), true);
  }
  // 第 4 次 → 429（Nest 过滤器统一 JSON：{statusCode,message,error}，不泄露内部细节）
  await assert.rejects(
    guard.canActivate(throttledCtx('tenant-1')),
    (e: any) => {
      assert.equal(e.getStatus(), 429);
      assert.match(String(e.getResponse()), /Rate limit exceeded/);
      return true;
    },
  );

  // tenant-2 不受影响（同一 IP）
  for (let i = 0; i < 3; i++) {
    assert.equal(await guard.canActivate(throttledCtx('tenant-2')), true);
  }
});

test('P0-4.2: 限流 —— 无认证上下文回退到 IP 维度', async () => {
  const guard = buildThrottlerEnv(2);
  await guard.onModuleInit();

  assert.equal(await guard.canActivate(throttledCtx(undefined)), true);
  assert.equal(await guard.canActivate(throttledCtx(undefined)), true);
  await assert.rejects(guard.canActivate(throttledCtx(undefined)), (e: any) => e.getStatus() === 429);
});
