import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceAction, isAllowlisted, FORBIDDEN_AUTO_ACTIONS } from './maintenance.allowlist';

/**
 * Phase 2 安全回归：自修复 allowlist + 禁止清单 + 审计 + 租户校验。
 * 不 mock 安全逻辑本身，只 mock 数据访问（prisma / embedding / leadIntel / audit）。
 */
function makePrisma() {
  return {
    tenant: { findUnique: async ({ where }: any) => (where.id === 't1' ? { id: 't1' } : null) },
    leadAnalysisRun: {
      count: async () => 2,
      findMany: async () => [{ id: 'r1', leadId: 'L1' }],
    },
    knowledge: { count: async () => 5, findMany: async () => [] },
    knowledgeEmbedding: { upsert: async () => ({}) },
  } as any;
}

function makeAudit() {
  const logs: any[] = [];
  const svc: any = { log: async (e: any) => { logs.push(e); return {}; } };
  return { svc, logs };
}

function makeEmbedding() {
  return { generateEmbedding: async () => 'emb' } as any;
}

function makeLeadIntel() {
  return { analyzeLeadWithRetry: async () => ({}) } as any;
}

describe('Phase2 Security: 自修复 allowlist 判定', () => {
  test('合法操作被允许', () => {
    assert.equal(isAllowlisted(MaintenanceAction.RETRY_FAILED_TASK), true);
    assert.equal(isAllowlisted(MaintenanceAction.REGENERATE_KB_INDEX), true);
  });

  test('非法操作不被允许', () => {
    assert.equal(isAllowlisted('NOT_A_REAL_ACTION' as any), false);
  });

  test('禁止清单含高风险操作', () => {
    for (const a of ['SCHEMA_CHANGE', 'DELETE_BUSINESS_DATA', 'MODIFY_PAYMENT_STATUS', 'CROSS_TENANT', 'PROD_DEPLOY']) {
      assert.ok(FORBIDDEN_AUTO_ACTIONS.includes(a), `缺少禁止项: ${a}`);
    }
  });
});

describe('Phase2 Security: 自修复执行边界', () => {
  test('合法操作执行并写审计', async () => {
    const { svc: audit, logs } = makeAudit();
    const svc = new MaintenanceService(makePrisma(), audit, makeEmbedding(), makeLeadIntel());
    const res = await svc.execute(MaintenanceAction.RETRY_FAILED_TASK, 't1', 'admin1', { reason: 'test' });
    assert.equal(res.success, true);
    assert.equal(res.allowlisted, true);
    assert.ok(logs.some((l) => l.action === 'MAINTENANCE_RETRY_FAILED_TASK' && l.success === true));
  });

  test('禁止清单操作 → 拒绝且写审计（不执行）', async () => {
    const { svc: audit, logs } = makeAudit();
    const svc = new MaintenanceService(makePrisma(), audit, makeEmbedding(), makeLeadIntel());
    await assert.rejects(
      () => svc.execute('SCHEMA_CHANGE' as any, 't1', 'admin1', {}),
      (e: any) => e instanceof ForbiddenException,
    );
    assert.ok(logs.some((l) => l.action === 'MAINTENANCE_SCHEMA_CHANGE' && l.success === false));
  });

  test('目标租户不存在 → NotFound（严格租户隔离）', async () => {
    const { svc: audit } = makeAudit();
    const svc = new MaintenanceService(makePrisma(), audit, makeEmbedding(), makeLeadIntel());
    await assert.rejects(
      () => svc.execute(MaintenanceAction.RETRY_FAILED_TASK, 'ghost', 'admin1', {}),
      (e: any) => e instanceof NotFoundException,
    );
  });
});
