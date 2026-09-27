import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

/**
 * Phase 2 安全回归：knowledge/:id 的租户隔离（F 修复验证）。
 * 模拟 PrismaService，断言 findOne/update/remove 的 where 必须包含 tenantId，
 * 跨租户一律按“不存在”处理（返回 null / 抛 NotFound），绝不泄漏他租户数据。
 */
function makePrisma() {
  let lastWhere: any = null;
  const calls: any = { findFirst: 0, update: 0, delete: 0 };
  const prisma: any = {
    knowledge: {
      findFirst: async ({ where }: any) => {
        calls.findFirst++;
        // 仅当 id 与 tenantId 同时匹配才返回，模拟真实租户过滤
        if (where.id === 'k1' && where.tenantId === 't1') {
          return { id: 'k1', tenantId: 't1', title: 'orig', content: 'orig' };
        }
        return null; // 跨租户或不存在 → null
      },
      update: async ({ where, data }: any) => {
        calls.update++;
        lastWhere = where;
        return { id: where.id, tenantId: where.tenantId, ...data };
      },
      delete: async ({ where }: any) => {
        calls.delete++;
        lastWhere = where;
        return { id: where.id };
      },
    },
    knowledgeChannel: {
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 }),
    },
    knowledgeEmbedding: {
      deleteMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
    },
  };
  return { prisma, calls, getLastWhere: () => lastWhere };
}

function makeEmbedding() {
  return { generateEmbedding: async () => 'emb' } as any;
}

describe('Phase2 Security: KnowledgeService 租户隔离', () => {
  test('findOne 同租户命中', async () => {
    const { prisma } = makePrisma();
    const svc = new KnowledgeService(prisma as any, makeEmbedding());
    const r = await svc.findOne('k1', 't1');
    assert.ok(r && r.tenantId === 't1');
  });

  test('findOne 跨租户 → null（不泄漏他租户存在性）', async () => {
    const { prisma, calls } = makePrisma();
    const svc = new KnowledgeService(prisma as any, makeEmbedding());
    const r = await svc.findOne('k1', 't2');
    assert.equal(r, null);
    assert.equal(calls.findFirst, 1);
  });

  test('update where 必须包含 tenantId', async () => {
    const { prisma, getLastWhere } = makePrisma();
    const svc = new KnowledgeService(prisma as any, makeEmbedding());
    await svc.update('k1', { tenantId: 't1', title: 'a', content: 'b', type: 'general' } as any);
    const where = getLastWhere();
    assert.equal(where.id, 'k1');
    assert.equal(where.tenantId, 't1');
  });

  test('remove 跨租户 → NotFound，且 delete 不被调用', async () => {
    const { prisma, calls } = makePrisma();
    const svc = new KnowledgeService(prisma as any, makeEmbedding());
    await assert.rejects(() => svc.remove('k1', 't2'), (e: any) => e instanceof NotFoundException);
    assert.equal(calls.delete, 0);
  });

  test('remove 同租户 → delete where 包含 tenantId', async () => {
    const { prisma, getLastWhere } = makePrisma();
    const svc = new KnowledgeService(prisma as any, makeEmbedding());
    await svc.remove('k1', 't1');
    const where = getLastWhere();
    assert.equal(where.id, 'k1');
    assert.equal(where.tenantId, 't1');
  });
});
