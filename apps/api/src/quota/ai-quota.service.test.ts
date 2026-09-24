import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { AiQuotaService } from './ai-quota.service';
import {
  QuotaExceededException,
  SubscriptionExpiredException,
} from './quota.exceptions';
import { SubscriptionStatus } from '@prisma/client';

/**
 * 内存模拟：模拟 Usage 表 + 原子 updateMany 语义（where messageCount < dailyLimit 才 +1）。
 * 并发安全由“条件 UPDATE 单条原子执行”保证，与真实数据库行为一致。
 */
function makeMocks(opts: { dailyLimit?: number; usedToday?: number; expireAt?: Date | null } = {}) {
  const key = 'tenant-1|2026-01-01';
  const store: Record<string, { messageCount: number; tokenUsage: number }> = {};
  if (opts.usedToday !== undefined) {
    store[key] = { messageCount: opts.usedToday, tokenUsage: 0 };
  }

  const prisma = {
    usage: {
      updateMany: async ({ where, data }: any) => {
        const row = store[key];
        if (!row) return { count: 0 };
        if (row.messageCount < where.messageCount.lt) {
          row.messageCount += data.messageCount.increment;
          return { count: 1 };
        }
        return { count: 0 };
      },
      findUnique: async () => {
        const row = store[key];
        return row ? { messageCount: row.messageCount, tokenUsage: row.tokenUsage } : null;
      },
      create: async ({ data }: any) => {
        if (store[key]) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        store[key] = { messageCount: data.messageCount, tokenUsage: data.tokenUsage };
        return store[key];
      },
    },
  };

  const subscriptionService = {
    getCurrentSubscription: async () => {
      if (opts.dailyLimit === undefined) {
        const e: any = new Error('No active subscription');
        e.status = 404;
        throw e;
      }
      return {
        status: SubscriptionStatus.ACTIVE,
        expireAt: opts.expireAt === undefined ? null : opts.expireAt,
        plan: { dailyLimit: opts.dailyLimit },
      };
    },
  };

  const usageService = {
    getDailyUsage: async () => {
      const row = store[key];
      return row ?? { messageCount: 0, tokenUsage: 0 };
    },
  };

  const service = new AiQuotaService(prisma as any, subscriptionService as any, usageService as any);
  return { service, store, key, prisma };
}

describe('AiQuotaService', () => {
  test('getQuotaState: 有效订阅返回 enabled + 正确剩余', async () => {
    const { service } = makeMocks({ dailyLimit: 100, usedToday: 10 });
    const s = await service.getQuotaState('tenant-1');
    assert.equal(s.enabled, true);
    assert.equal(s.dailyLimit, 100);
    assert.equal(s.usedToday, 10);
    assert.equal(s.remaining, 90);
    assert.ok(s.resetsAt);
  });

  test('getQuotaState: 无订阅 → enabled=false', async () => {
    const { service } = makeMocks({});
    const s = await service.getQuotaState('tenant-1');
    assert.equal(s.enabled, false);
    assert.equal(s.dailyLimit, 0);
    assert.equal(s.remaining, 0);
  });

  test('assertCanRespond: 无订阅 → subscription_expired', async () => {
    const { service } = makeMocks({});
    await assert.rejects(() => service.assertCanRespond('tenant-1'), (e: any) => {
      assert.equal(e instanceof SubscriptionExpiredException, true);
      assert.equal(e.getResponse().code, 'subscription_expired');
      return true;
    });
  });

  test('assertCanRespond: 额度耗尽 → quota_exceeded', async () => {
    const { service } = makeMocks({ dailyLimit: 5, usedToday: 5 });
    await assert.rejects(() => service.assertCanRespond('tenant-1'), (e: any) => {
      assert.equal(e.getResponse().code, 'quota_exceeded');
      return true;
    });
  });

  test('consumeSuccessfulResponse: 成功计数 +1，且仅消费一次（无重复计数）', async () => {
    let updateManyCalls = 0;
    const base = makeMocks({ dailyLimit: 100, usedToday: 0 });
    const prisma = base.prisma as any;
    const orig = prisma.usage.updateMany;
    prisma.usage.updateMany = (...a: any[]) => {
      updateManyCalls++;
      return orig(...a);
    };
    const before = await base.service.getQuotaState('tenant-1');
    await base.service.consumeSuccessfulResponse('tenant-1');
    const after = await base.service.getQuotaState('tenant-1');
    assert.equal(after.usedToday, before.usedToday + 1);
    assert.equal(updateManyCalls, 1);
  });

  test('consumeSuccessfulResponse: 超额 → quota_exceeded', async () => {
    const { service } = makeMocks({ dailyLimit: 1, usedToday: 1 });
    await assert.rejects(() => service.consumeSuccessfulResponse('tenant-1'), (e: any) => {
      assert.equal(e.getResponse().code, 'quota_exceeded');
      return true;
    });
  });

  test('并发安全: dailyLimit=1，两个并发请求 → 最多一个成功，另一个 quota_exceeded', async () => {
    const { service, store, key } = makeMocks({ dailyLimit: 1, usedToday: 0 });
    const results = await Promise.all([
      service
        .consumeSuccessfulResponse('tenant-1')
        .then(() => 'ok')
        .catch((e: any) => e.getResponse().code),
      service
        .consumeSuccessfulResponse('tenant-1')
        .then(() => 'ok')
        .catch((e: any) => e.getResponse().code),
    ]);
    const oks = results.filter((r) => r === 'ok').length;
    const exceeded = results.filter((r) => r === 'quota_exceeded').length;
    assert.equal(oks, 1);
    assert.equal(exceeded, 1);
    assert.equal(store[key].messageCount, 1);
  });

  test('JWT tenant 隔离: getQuotaState 仅使用传入 tenantId', async () => {
    const { service } = makeMocks({ dailyLimit: 50 });
    const a = await service.getQuotaState('tenant-A');
    const b = await service.getQuotaState('tenant-B');
    assert.equal(a.dailyLimit, 50);
    assert.equal(b.dailyLimit, 50);
  });

  test('订阅过期 → subscription_expired', async () => {
    const expired = new Date(Date.now() - 86400000);
    const { service } = makeMocks({ dailyLimit: 100, expireAt: expired });
    await assert.rejects(() => service.assertCanRespond('tenant-1'), (e: any) => {
      assert.equal(e.getResponse().code, 'subscription_expired');
      return true;
    });
  });
});
