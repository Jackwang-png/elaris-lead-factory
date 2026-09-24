import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { HandoffService } from './handoff.service';

/**
 * GROWTH-STAFF-07 人工客服 Handoff 单元测试（mock 化，离线可运行）。
 * 覆盖任务十二权限测试 1-18（claim / reply / resolve 权限、租户隔离、并发、重新 handoff、审计）。
 */
const mockConfig = { get: () => 'true' } as unknown as ConfigService;

function makeConv(id: string, fields: any = {}) {
  return {
    id,
    tenantId: 't1',
    needsHuman: false,
    handoffReason: null,
    handoffAt: null,
    resolvedAt: null,
    claimedByUserId: null,
    claimedAt: null,
    ...fields,
  };
}

function matchWhere(c: any, where: any): boolean {
  return Object.keys(where).every((k) => {
    if (k === 'OR') return (where.OR as any[]).some((cond) => matchWhere(c, cond));
    const cond = where[k];
    if (cond && typeof cond === 'object' && 'in' in cond) {
      return (cond.in as any[]).includes(c[k]);
    }
    return c[k] === cond;
  });
}

function buildPrisma(state: any) {
  const calls: any = { updateMany: 0, findFirst: 0, findUnique: 0, create: 0, update: 0 };
  const prisma: any = {
    conversation: {
      updateMany: async ({ where, data }: any) => {
        calls.updateMany++;
        const matched = state.conversations.filter((c: any) => matchWhere(c, where));
        for (const conv of matched) Object.assign(conv, data);
        return { count: matched.length };
      },
      findFirst: async ({ where, select }: any) => {
        calls.findFirst++;
        const conv = state.conversations.find((c: any) => matchWhere(c, where));
        if (!conv) return null;
        if (select) {
          const o: any = {};
          for (const k of Object.keys(select)) o[k] = conv[k];
          return o;
        }
        return conv;
      },
      findUnique: async ({ where }: any) => {
        calls.findUnique++;
        return state.conversations.find((c: any) => c.id === where.id) || null;
      },
      update: async ({ where, data }: any) => {
        calls.update++;
        const conv = state.conversations.find((c: any) => c.id === where.id);
        if (conv) Object.assign(conv, data);
        return conv;
      },
      findMany: async ({ where }: any) => {
        return state.conversations.filter((c: any) => {
          if (where.tenantId && c.tenantId !== where.tenantId) return false;
          if (where.needsHuman !== undefined && c.needsHuman !== where.needsHuman) return false;
          if (where.OR) return where.OR.some((cond: any) => matchWhere(c, cond));
          return true;
        });
      },
    },
    message: {
      create: async (d: any) => {
        calls.create++;
        return { id: d.data.id, ...d.data };
      },
    },
    // 最小事务透传：回调内使用同一 prisma 实例（与真实 $transaction 语义一致，用于 reply 原子性测试）
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, calls };
}

function buildService(state: any, auditLog: any[] = []) {
  const auditService: any = { log: async (e: any) => { auditLog.push(e); return {}; } };
  const serverChan: any = { send: async () => true };
  const svc = new HandoffService(state.prisma, mockConfig, serverChan, auditService as any);
  return { svc, auditLog };
}

function fakeCtx(role: string | null) {
  return { switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : null }) }) } as any;
}

describe('GROWTH-STAFF-07: Handoff API 权限矩阵（RolesGuard merchant+CUSTOMER_SERVICE）', () => {
  const g = new RolesGuard(['merchant', 'CUSTOMER_SERVICE']);
  test('OWNER(merchant) 允许', () => assert.equal(g.canActivate(fakeCtx('merchant')), true));
  test('CUSTOMER_SERVICE 允许', () => assert.equal(g.canActivate(fakeCtx('CUSTOMER_SERVICE')), true));
  test('普通 user → 403', () => assert.throws(() => g.canActivate(fakeCtx('user')), ForbiddenException));
  test('admin → 403（平台/商家分离，普通 handoff API 不可跨租户操作）', () =>
    assert.throws(() => g.canActivate(fakeCtx('admin')), ForbiddenException));
  test('未登录 → 403', () => assert.throws(() => g.canActivate(fakeCtx(null)), ForbiddenException));
});

describe('GROWTH-STAFF-07: Claim', () => {
  test('1/2. OWNER / CUSTOMER_SERVICE 认领待人工会话成功', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const conv: any = await svc.claim('c1', 't1', 'csA');
    assert.equal(conv.claimedByUserId, 'csA');
    assert.ok(conv.claimedAt);
  });

  test('10. 跨租户 claim → 404（不泄漏他租户会话存在）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, tenantId: 't2' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.claim('c1', 't1', 'csA'), (e: any) => e instanceof NotFoundException);
  });

  test('13. 已认领的会话再次 claim → ConflictException', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.claim('c1', 't1', 'csB'), (e: any) => e instanceof ConflictException && /已被其他客服认领/.test(e.message));
  });

  test('14. 已处理的会话 claim → ConflictException', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, resolvedAt: new Date() })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.claim('c1', 't1', 'csA'), (e: any) => e instanceof ConflictException && /已处理/.test(e.message));
  });

  test('15. needsHuman=false 的会话 claim → BadRequest', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: false })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.claim('c1', 't1', 'csA'), (e: any) => e instanceof BadRequestException);
  });
});

describe('GROWTH-STAFF-07: Reply 权限', () => {
  test('4. OWNER 回复他人认领的会话 → 允许', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const msg: any = await svc.reply('c1', 't1', '您好', 'owner1', 'merchant');
    assert.equal(msg.sender, 'agent');
  });

  test('5. CUSTOMER_SERVICE 回复自己认领的会话 → 允许', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const msg: any = await svc.reply('c1', 't1', '您好', 'csA', 'CUSTOMER_SERVICE');
    assert.equal(msg.sender, 'agent');
  });

  test('6. CUSTOMER_SERVICE 回复他人认领的会话 → 403', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(
      () => svc.reply('c1', 't1', '您好', 'csB', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof ForbiddenException,
    );
  });

  test('11. 跨租户 reply → 404', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, tenantId: 't2' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.reply('c1', 't1', '您好', 'csA', 'CUSTOMER_SERVICE'), (e: any) => e instanceof NotFoundException);
  });

  test('回复空内容 → BadRequest（既有行为保留）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.reply('c1', 't1', '   ', 'csA', 'CUSTOMER_SERVICE'), (e: any) => e instanceof BadRequestException);
  });

  test('回复后标记已处理（needsHuman=false, resolvedAt 写入）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await svc.reply('c1', 't1', '您好', 'csA', 'CUSTOMER_SERVICE');
    const conv = state.conversations.find((c: any) => c.id === 'c1');
    assert.equal(conv.needsHuman, false);
    assert.ok(conv.resolvedAt);
  });
});

describe('GROWTH-STAFF-07: Resolve 权限', () => {
  test('7. OWNER 处理他人认领的会话 → 允许', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const updated: any = await svc.resolve('c1', 't1', 'owner1', 'merchant');
    assert.equal(updated.needsHuman, false);
  });

  test('8. CUSTOMER_SERVICE 处理自己认领的会话 → 允许', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const updated: any = await svc.resolve('c1', 't1', 'csA', 'CUSTOMER_SERVICE');
    assert.equal(updated.needsHuman, false);
  });

  test('9. CUSTOMER_SERVICE 处理他人认领的会话 → 403', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.resolve('c1', 't1', 'csB', 'CUSTOMER_SERVICE'), (e: any) => e instanceof ForbiddenException);
  });

  test('12. 跨租户 resolve → 404', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, tenantId: 't2' })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(() => svc.resolve('c1', 't1', 'csA', 'CUSTOMER_SERVICE'), (e: any) => e instanceof NotFoundException);
  });

  test('resolve 保留 claimedByUserId / claimedAt（不清除历史状态）', async () => {
    const claimedAt = new Date();
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA', claimedAt })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const updated: any = await svc.resolve('c1', 't1', 'csA', 'CUSTOMER_SERVICE');
    assert.equal(updated.claimedByUserId, 'csA');
    assert.ok(updated.claimedAt === claimedAt || updated.claimedAt instanceof Date);
  });
});

describe('GROWTH-STAFF-07: 待处理列表（含 claimedBy 字段）', () => {
  test('3. listPending 返回 claimedByUserId / claimedAt 字段（非敏感）', async () => {
    const state: any = {
      prisma: null as any,
      conversations: [
        makeConv('c1', { needsHuman: true, claimedByUserId: 'csA', claimedAt: new Date() }),
        makeConv('c2', { needsHuman: true, claimedByUserId: null }),
        makeConv('c3', { needsHuman: false }), // 非待处理
      ],
    };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    const all: any[] = await svc.listPending('t1');
    assert.equal(all.length, 2);
    assert.ok('claimedByUserId' in all[0] && 'claimedAt' in all[0]);
    // mine 过滤：仅我认领 + 待认领
    const mine: any[] = await svc.listPending('t1', { mine: true, userId: 'csA' });
    assert.equal(mine.length, 2);
    assert.ok(mine.every((c) => c.claimedByUserId === 'csA' || c.claimedByUserId === null));
  });
});

describe('GROWTH-STAFF-07: 并发 claim', () => {
  test('16. 客服 A + 客服 B 并发 claim → 只有一个成功，最终 claimedByUserId = 胜者', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc, auditLog } = buildService(state);
    const results = await Promise.allSettled([svc.claim('c1', 't1', 'csA'), svc.claim('c1', 't1', 'csB')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof ConflictException);
    const conv = state.conversations.find((c: any) => c.id === 'c1');
    assert.ok(conv.claimedByUserId === 'csA' || conv.claimedByUserId === 'csB');
    assert.equal(auditLog.filter((a) => a.action === 'HANDOFF_CLAIMED').length, 1);
  });
});

describe('GROWTH-STAFF-07: 重新 handoff（已解决后再转人工）', () => {
  test('18. 已 resolved 且曾认领的会话，再次 markHandoff 后可由他人认领', async () => {
    const state: any = {
      prisma: null as any,
      conversations: [makeConv('c1', { needsHuman: false, resolvedAt: new Date(), claimedByUserId: 'csA', claimedAt: new Date() })],
    };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc } = buildService(state);
    await svc.markHandoff('c1', 't1', 'manual');
    const afterMark = state.conversations.find((c: any) => c.id === 'c1');
    assert.equal(afterMark.claimedByUserId, null, '重新转人工应清除认领人');
    assert.equal(afterMark.claimedAt, null);
    assert.equal(afterMark.resolvedAt, null);
    assert.equal(afterMark.needsHuman, true);
    const claimed: any = await svc.claim('c1', 't1', 'csB');
    assert.equal(claimed.claimedByUserId, 'csB', '新会话可被他人认领');
  });
});

describe('GROWTH-STAFF-07: 审计', () => {
  test('17. claim / reply / resolve 写入正确 action + tenantId + actorUserId + conversationId', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state);
    state.prisma = prisma;
    const { svc, auditLog } = buildService(state);
    await svc.claim('c1', 't1', 'csA');
    await svc.reply('c1', 't1', '您好', 'csA', 'CUSTOMER_SERVICE');
    await svc.resolve('c1', 't1', 'csA', 'CUSTOMER_SERVICE');
    const claimed = auditLog.find((a) => a.action === 'HANDOFF_CLAIMED');
    const replied = auditLog.find((a) => a.action === 'HANDOFF_REPLY');
    const resolved = auditLog.find((a) => a.action === 'HANDOFF_RESOLVED');
    for (const e of [claimed, replied, resolved]) {
      assert.ok(e, '应记录审计');
      assert.equal(e.tenantId, 't1');
      assert.equal(e.resource, 'Conversation');
      assert.equal(e.resourceId, 'c1');
    }
    assert.equal(claimed.userId, 'csA');
  });
});

describe('GROWTH-STAFF-07.1: 并发 / ownership 一致性（reply/resolve 原子归属）', () => {
  // 模拟“A 读取为 unclaimed、B 同时 claim”的竞态：findFirst 返回 null 快照，
  // 但 updateMany 针对 LIVE 状态（已变为 B）评估原子 ownership 条件。
  function makeRacePrisma(liveClaimedBy: string | null) {
    const auditLog: any[] = [];
    const prisma: any = {
      $transaction: async (fn: any) => {
        const snapshot = { ...makeConv('c1', { needsHuman: true }), claimedByUserId: null };
        const tx = {
          conversation: {
            findFirst: async () => snapshot,
            updateMany: async ({ where }: any) => {
              const or = where.OR as any[] | undefined;
              if (!or) return { count: 1 };
              const allowed = or.map((c: any) => c.claimedByUserId); // [null, 'A']
              if (allowed.includes(liveClaimedBy)) return { count: 1 };
              return { count: 0 };
            },
          },
          message: { create: async () => ({ id: 'm1' }) },
        };
        return fn(tx);
      },
    };
    return { prisma, auditLog };
  }

  test('1. A 未 claim 时开始 reply，B 同时 claim → A 回复被原子拒（不写消息/不审计）', async () => {
    const { prisma, auditLog } = makeRacePrisma('B'); // 并发后 live = B
    const svc = new HandoffService(
      prisma,
      mockConfig,
      { send: async () => true },
      { log: async (e: any) => { auditLog.push(e); return {}; } } as any,
    );
    await assert.rejects(
      () => svc.reply('c1', 't1', '您好', 'A', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof ForbiddenException,
    );
    assert.equal(auditLog.length, 0, '被拒的回复不应写入审计');
  });

  test('2. ownership 变化后 A reply 必须在“写入时”重新验证（消息已尝试创建但因事务回滚未生效）', async () => {
    const { prisma, auditLog } = makeRacePrisma('B');
    let msgCreated = 0;
    prisma.$transaction = async (fn: any) => {
      const snapshot = { ...makeConv('c1', { needsHuman: true }), claimedByUserId: null };
      const tx = {
        conversation: {
          findFirst: async () => snapshot,
          updateMany: async ({ where }: any) => {
            const or = where.OR as any[] | undefined;
            if (!or) return { count: 1 };
            const allowed = or.map((c: any) => c.claimedByUserId);
            if (allowed.includes('B')) return { count: 1 };
            return { count: 0 };
          },
        },
        message: { create: async () => { msgCreated++; return { id: 'm1' }; } },
      };
      return fn(tx);
    };
    const svc = new HandoffService(
      prisma,
      mockConfig,
      { send: async () => true },
      { log: async (e: any) => { auditLog.push(e); return {}; } } as any,
    );
    await assert.rejects(
      () => svc.reply('c1', 't1', '您好', 'A', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof ForbiddenException,
    );
    assert.ok(msgCreated > 0, '消息创建曾被执行（证明防护在写入时而非读取时）');
    assert.equal(auditLog.length, 0, '事务回滚：审计不记录');
  });

  test('3. B 不能 reply A 已 claim 的会话 → 403', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(
      () => svc.reply('c1', 't1', '您好', 'csB', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof ForbiddenException,
    );
  });

  test('4. B 不能 resolve A 已 claim 的会话 → 403（原子 WHERE 拦截）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(
      () => svc.resolve('c1', 't1', 'csB', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof ForbiddenException,
    );
  });

  test('5. OWNER 正常 reply（本 Tenant 不受 claimedBy 限制）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc } = buildService(state);
    const msg: any = await svc.reply('c1', 't1', '您好', 'owner1', 'merchant');
    assert.equal(msg.sender, 'agent');
  });

  test('6. OWNER 正常 resolve（本 Tenant 不受 claimedBy 限制）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, claimedByUserId: 'csA' })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc } = buildService(state);
    const updated: any = await svc.resolve('c1', 't1', 'owner1', 'merchant');
    assert.equal(updated.needsHuman, false);
  });

  test('7. 跨 Tenant reply / resolve → 404（不泄漏存在性）', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true, tenantId: 't2' })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc } = buildService(state);
    await assert.rejects(
      () => svc.reply('c1', 't1', '您好', 'csA', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof NotFoundException,
    );
    await assert.rejects(
      () => svc.resolve('c1', 't1', 'csA', 'CUSTOMER_SERVICE'),
      (e: any) => e instanceof NotFoundException,
    );
  });

  test('8. 并发 claim 回归 → 只有一个成功', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc, auditLog } = buildService(state);
    const results = await Promise.allSettled([svc.claim('c1', 't1', 'csA'), svc.claim('c1', 't1', 'csB')]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    const conv = state.conversations.find((c: any) => c.id === 'c1');
    assert.ok(conv.claimedByUserId === 'csA' || conv.claimedByUserId === 'csB');
    assert.equal(auditLog.filter((a: any) => a.action === 'HANDOFF_CLAIMED').length, 1);
  });

  test('9. AuditLog 回归：claim / reply / resolve 各记一条正确记录', async () => {
    const state: any = { prisma: null as any, conversations: [makeConv('c1', { needsHuman: true })] };
    const { prisma } = buildPrisma(state); state.prisma = prisma;
    const { svc, auditLog } = buildService(state);
    await svc.claim('c1', 't1', 'csA');
    await svc.reply('c1', 't1', '您好', 'csA', 'CUSTOMER_SERVICE');
    await svc.resolve('c1', 't1', 'csA', 'CUSTOMER_SERVICE');
    for (const action of ['HANDOFF_CLAIMED', 'HANDOFF_REPLY', 'HANDOFF_RESOLVED']) {
      const e = auditLog.find((a: any) => a.action === action);
      assert.ok(e, `应记录 ${action}`);
      assert.equal(e.tenantId, 't1');
      assert.equal(e.resourceId, 'c1');
      assert.equal(e.resource, 'Conversation');
    }
  });
});
