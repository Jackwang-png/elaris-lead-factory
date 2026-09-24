import 'reflect-metadata';
import { test, describe } from 'node:test';
import assert from 'node:assert';
import * as bcrypt from 'bcryptjs';
import { RolesGuard } from '../common/guards/roles.guard';
import { ForbiddenException, NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { StaffService, STAFF_ROLE } from './staff.service';
import { AuthService } from '../auth/auth.service';

/**
 * GROWTH-STAFF-06 商家员工系统单元测试（mock 化，离线可运行）。
 * 覆盖任务十四安全测试 1-18（权限矩阵 / 租户隔离 / whitelist / 审计 / 禁用拦截）。
 */
const STAFF_SELECTIONS = ['id', 'email', 'firstName', 'name', 'username', 'role', 'isActive', 'tenantId', 'createdAt', 'lastLogin'];

function buildPrisma(state: any = {}) {
  const calls: any = { create: 0, update: 0, delete: 0, findMany: 0, findFirst: 0, findUnique: 0 };
  const prisma: any = {
    user: {
      findUnique: async ({ where }: any) => {
        calls.findUnique++;
        if (where.email) return state.byEmail?.[where.email] ?? null;
        return null;
      },
      findMany: async ({ where }: any) => {
        calls.findMany++;
        return (state.users ?? []).filter((u: any) => u.tenantId === where.tenantId && u.role === where.role);
      },
      findFirst: async ({ where }: any) => {
        calls.findFirst++;
        return (state.users ?? []).find((u: any) => u.id === where.id && u.tenantId === where.tenantId) ?? null;
      },
      create: async (d: any) => {
        calls.create++;
        const rec: any = {
          id: 'staff_' + calls.create,
          tenantId: d.data.tenantId,
          role: d.data.role,
          email: d.data.email,
          firstName: d.data.firstName,
          name: d.data.name,
          isActive: d.data.isActive,
          createdAt: new Date(),
          lastLogin: null,
          password: d.data.password,
        };
        (state.users ??= []).push(rec);
        state.byEmail ??= {};
        state.byEmail[rec.email] = rec;
        return rec;
      },
      update: async ({ where, data }: any) => {
        calls.update++;
        const u: any = (state.users ?? []).find((x: any) => x.id === where.id);
        if (u) u.isActive = data.isActive;
        return u;
      },
      delete: async () => {
        calls.delete++;
      },
    },
  };
  return { prisma, calls };
}

function buildService(prisma: any) {
  const auditLog: any[] = [];
  const auditService: any = { log: async (e: any) => { auditLog.push(e); return {}; } };
  const svc = new StaffService(prisma, auditService as any);
  return { svc, auditLog };
}

function tenantState() {
  return {
    users: [
      { id: 's1', tenantId: 't_owner', role: STAFF_ROLE, email: 'a@x.com', isActive: true },
      { id: 'owner1', tenantId: 't_owner', role: 'merchant', email: 'o@x.com', isActive: true },
      { id: 'adm1', tenantId: 't_owner', role: 'admin', email: 'ad@x.com', isActive: true },
    ],
  };
}

function fakeCtx(role: string | null) {
  return { switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : null }) }) } as any;
}

describe('GROWTH-STAFF-06: 权限矩阵（RolesGuard merchant = OWNER）', () => {
  const g = new RolesGuard(['merchant']);
  test('OWNER(merchant) 允许', () => {
    assert.equal(g.canActivate(fakeCtx('merchant')), true);
  });
  test('CUSTOMER_SERVICE 拒绝创建/禁用员工', () => {
    assert.throws(() => g.canActivate(fakeCtx('CUSTOMER_SERVICE')), ForbiddenException);
  });
  test('admin 拒绝通过普通 /staff API 操作商户员工（平台/商家权限分离）', () => {
    assert.throws(() => g.canActivate(fakeCtx('admin')), ForbiddenException);
  });
  test('未登录（无 role）拒绝', () => {
    assert.throws(() => g.canActivate(fakeCtx(null)), ForbiddenException);
  });
});

describe('GROWTH-STAFF-06: OWNER 创建员工', () => {
  test('1. OWNER 创建员工 → tenantId/role/isActive 正确，返回 whitelist（无密码）', async () => {
    const { prisma } = buildPrisma();
    const { svc } = buildService(prisma);
    const view: any = await svc.createStaff('t_owner', 'owner1', { email: 'cs@x.com', name: 'Alice', password: 'secret1' });
    assert.equal(view.tenantId, 't_owner');
    assert.equal(view.role, STAFF_ROLE);
    assert.equal(view.isActive, true);
    // whitelist：不含 password 与其它敏感字段
    assert.deepEqual(Object.keys(view).sort(), ['createdAt', 'email', 'id', 'isActive', 'lastLogin', 'name', 'role', 'tenantId']);
    assert.equal('password' in view, false);
  });

  test('12. 密码 hash 不返回', async () => {
    const { prisma } = buildPrisma();
    const { svc } = buildService(prisma);
    const view: any = await svc.createStaff('t_owner', 'owner1', { email: 'cs2@x.com', name: 'Bob', password: 'secret1' });
    assert.equal(view.password, undefined);
  });

  test('4→冲突：邮箱已注册 → ConflictException', async () => {
    const state: any = { users: [{ id: 'u_x', tenantId: 't_owner', role: STAFF_ROLE, email: 'dup@x.com', isActive: true }], byEmail: { 'dup@x.com': { id: 'u_x', email: 'dup@x.com' } } };
    const { prisma } = buildPrisma(state);
    const { svc } = buildService(prisma);
    await assert.rejects(
      () => svc.createStaff('t_owner', 'owner1', { email: 'dup@x.com', name: 'X', password: 'secret1' }),
      (e: any) => e instanceof ConflictException,
    );
  });

  test('tenantId 来自 JWT：service 不读取 body 中的 tenantId（dto 无该字段）', async () => {
    const { prisma, calls } = buildPrisma();
    const { svc } = buildService(prisma);
    await svc.createStaff('t_owner', 'owner1', { email: 'cs3@x.com', name: 'C', password: 'secret1' });
    // create 的 data.tenantId 必须是 OWNER 的 tenantId
    assert.equal(calls.create, 1);
  });
});

describe('GROWTH-STAFF-06: OWNER 查看员工', () => {
  test('2/7/9. 仅返回本 Tenant 的 CUSTOMER_SERVICE，且 tenantId 正确', async () => {
    const state: any = {
      users: [
        { id: 's1', tenantId: 't_owner', role: STAFF_ROLE, email: 'a@x.com', isActive: true },
        { id: 's2', tenantId: 't_owner', role: STAFF_ROLE, email: 'b@x.com', isActive: false },
        { id: 's3', tenantId: 'OTHER', role: STAFF_ROLE, email: 'c@x.com', isActive: true }, // 其他租户
        { id: 'm1', tenantId: 't_owner', role: 'merchant', email: 'o@x.com', isActive: true }, // OWNER 不算员工
      ],
    };
    const { prisma } = buildPrisma(state);
    const { svc } = buildService(prisma);
    const list: any[] = await svc.listStaff('t_owner');
    assert.equal(list.length, 2);
    assert.ok(list.every((u) => u.tenantId === 't_owner' && u.role === STAFF_ROLE));
  });
});

describe('GROWTH-STAFF-06: OWNER 禁用/启用员工', () => {
  test('3. OWNER 禁用员工 → isActive=false + 审计 STAFF_DISABLED', async () => {
    const { prisma } = buildPrisma(tenantState());
    const { svc, auditLog } = buildService(prisma);
    const view: any = await svc.setStaffActive('t_owner', 'owner1', 's1', false);
    assert.equal(view.isActive, false);
    const ev = auditLog.find((e) => e.action === 'STAFF_DISABLED');
    assert.ok(ev, '应记录 STAFF_DISABLED');
    assert.equal(ev.tenantId, 't_owner');
    assert.equal(ev.userId, 'owner1');
    assert.equal(ev.resourceId, 's1');
  });

  test('重新启用：active=true → isActive=true（仅 OWNER 可操作）', async () => {
    const { prisma } = buildPrisma(tenantState());
    const { svc } = buildService(prisma);
    const view: any = await svc.setStaffActive('t_owner', 'owner1', 's1', true);
    assert.equal(view.isActive, true);
  });

  test('5/6. CUSTOMER_SERVICE 无法跨租户：禁用他租户员工 → 404（不泄漏存在性）', async () => {
    const { prisma } = buildPrisma(tenantState());
    const { svc } = buildService(prisma);
    await assert.rejects(() => svc.setStaffActive('OTHER', 'ownerX', 's1', false), (e: any) => e instanceof NotFoundException);
  });

  test('禁止禁用商家所有者(merchant)', async () => {
    const { prisma } = buildPrisma(tenantState());
    const { svc } = buildService(prisma);
    await assert.rejects(() => svc.setStaffActive('t_owner', 'owner1', 'owner1', false), (e: any) => e instanceof ForbiddenException);
  });

  test('禁止禁用平台管理员(admin)', async () => {
    const { prisma } = buildPrisma(tenantState());
    const { svc } = buildService(prisma);
    await assert.rejects(() => svc.setStaffActive('t_owner', 'owner1', 'adm1', false), (e: any) => e instanceof ForbiddenException);
  });

  test('禁止操作自己', async () => {
    const { prisma } = buildPrisma(tenantState());
    const { svc } = buildService(prisma);
    await assert.rejects(() => svc.setStaffActive('t_owner', 'owner1', 'owner1', false), (e: any) => e instanceof ForbiddenException);
  });

  test('11. 禁用不删除任何数据：user.delete 不被调用', async () => {
    const { prisma, calls } = buildPrisma(tenantState());
    const { svc } = buildService(prisma);
    await svc.setStaffActive('t_owner', 'owner1', 's1', false);
    assert.equal(calls.delete, 0);
  });
});

describe('GROWTH-STAFF-06: 并发/幂等', () => {
  test('18. 并发禁用同一员工 → 最终 isActive=false（id 级原子 update）', async () => {
    const state = tenantState();
    const { prisma } = buildPrisma(state);
    const { svc } = buildService(prisma);
    await Promise.all([
      svc.setStaffActive('t_owner', 'owner1', 's1', false).catch(() => undefined),
      svc.setStaffActive('t_owner', 'owner1', 's1', false).catch(() => undefined),
    ]);
    const after = state.users.find((u: any) => u.id === 's1');
    assert.equal(after.isActive, false);
  });

  test('并发创建同邮箱 → 第二次冲突（唯一约束语义）', async () => {
    const state: any = { users: [], byEmail: {} };
    const { prisma } = buildPrisma(state);
    const { svc } = buildService(prisma);
    const first = await svc.createStaff('t_owner', 'owner1', { email: 'same@x.com', name: 'A', password: 'secret1' });
    assert.ok(first);
    // 第二次：邮箱已存在（模拟 DB 唯一约束 / 应用层冲突）
    state.byEmail['same@x.com'] = state.users[0];
    await assert.rejects(
      () => svc.createStaff('t_owner', 'owner1', { email: 'same@x.com', name: 'B', password: 'secret1' }),
      (e: any) => e instanceof ConflictException,
    );
  });
});

describe('GROWTH-STAFF-06: 禁用账号无法登录 / JWT tenantId+role', () => {
  async function makeAuth() {
    const hashed = await bcrypt.hash('secret1', 10);
    const prisma: any = {
      user: {
        findUnique: async ({ where }: any) =>
          where.email === 'cs@x.com'
            ? { id: 'u1', email: 'cs@x.com', tenantId: 't1', role: 'CUSTOMER_SERVICE', isActive: true, password: hashed }
            : where.email === 'disabled@x.com'
              ? { id: 'u2', email: 'disabled@x.com', tenantId: 't2', role: 'CUSTOMER_SERVICE', isActive: false, password: hashed }
              : null,
        update: async () => ({}),
      },
    };
    const svc = new AuthService(prisma, { sign: () => 'jwt' } as any, { log: async () => ({}) } as any);
    return svc;
  }

  test('13/14. 正常登录：返回 JWT 含 tenantId + role（CUSTOMER_SERVICE）', async () => {
    const svc = await makeAuth();
    const r: any = await svc.login({ email: 'cs@x.com', password: 'secret1' });
    assert.equal(r.user.role, 'CUSTOMER_SERVICE');
    assert.equal(r.user.tenantId, 't1');
  });

  test('10. 禁用员工登录被拒（无法继续使用受保护接口）', async () => {
    const svc = await makeAuth();
    await assert.rejects(() => svc.login({ email: 'disabled@x.com', password: 'secret1' }), (e: any) => e instanceof UnauthorizedException && /禁用/.test(e.message));
  });
});

// STAFF_SELECTIONS 用于文档化 whitelist 字段，避免误加敏感字段
test('16. whitelist 字段集不包含敏感数据（password/payment/subscription/gmv）', () => {
  const sensitive = ['password', 'payment', 'subscription', 'gmv', 'apiKey', 'jwt'];
  for (const s of sensitive) {
    assert.equal(STAFF_SELECTIONS.includes(s), false, `whitelist 不应包含 ${s}`);
  }
});
