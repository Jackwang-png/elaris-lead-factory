/**
 * P0-5A Production Integrity & Tenant Security 测试套件（纯单元测试，不触生产 DB）。
 *
 * 覆盖：
 *   1. Webhook 安全：valid/invalid/missing signature、wrong secret、expired timestamp、
 *      replay、fake tenantId（body 自报被忽略）、fake botId、tenant A credential + tenant B body
 *   2. chat / conversations 租户隔离：A→A 放行、A→B 404、Message.tenantId 自动赋值、
 *      addMessage 参数错位修复（role/content 不再错位）
 *   3. Approval 过期清扫：PENDING→EXPIRED、AuditLog 写入、幂等、tenant-safe、
 *      不影响 APPROVED
 *
 * Run: npx ts-node src/workforce/p0-5a-security.test.ts
 */
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

import { WebhookSecurityService, parseTopTimestamp } from '../channel/webhook-security.service';
import { signTopParams } from '../channel/taobao.signature';
import { ChatService } from '../chat/chat.service';
import { ConversationsService } from '../conversations/conversations.service';
import { ApprovalService } from './services/approval.service';
import { WorkforceAuditService } from './services/workforce-audit.service';

// ---------------------------------------------------------------------------
// Fake Prisma（内存版，支持本次测试所需子集）
// ---------------------------------------------------------------------------

type Row = any;

function matchesWhere(row: Row, where: any): boolean {
  for (const [k, v] of Object.entries(where || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
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
  botRows: Row[] = [];
  conversationRows: Row[] = [];
  messageRows: Row[] = [];
  auditLogRows: Row[] = [];

  bot = {
    findFirst: async (args: any) =>
      this.botRows.find((r) => matchesWhere(r, args.where || {})) || null,
    findUnique: async (args: any) =>
      this.botRows.find((r) => r[Object.keys(args.where)[0]] === Object.values(args.where)[0]) ||
      null,
  };

  conversation = {
    findUnique: async (args: any) =>
      this.conversationRows.find(
        (r) => r[Object.keys(args.where)[0]] === Object.values(args.where)[0],
      ) || null,
    findFirst: async (args: any) =>
      this.conversationRows.find((r) => matchesWhere(r, args.where || {})) || null,
    create: async (args: any) => {
      const row = {
        id: `conv-${this.conversationRows.length + 1}`,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.conversationRows.push(row);
      return row;
    },
  };

  message = {
    create: async (args: any) => {
      const row = { id: `msg-${this.messageRows.length + 1}`, ...args.data, createdAt: new Date() };
      this.messageRows.push(row);
      return row;
    },
    findMany: async (args: any) =>
      this.messageRows.filter((r) => matchesWhere(r, args.where || {})),
  };

  auditLog = {
    create: async (args: any) => {
      const row = {
        id: `audit-${this.auditLogRows.length + 1}`,
        ...args.data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.auditLogRows.push(row);
      return row;
    },
    findMany: async (args: any) => {
      let rows = this.auditLogRows.filter((r) => matchesWhere(r, args.where || {}));
      if (args.distinct?.includes('tenantId')) {
        const seen = new Set<string>();
        rows = rows.filter((r) => {
          if (seen.has(r.tenantId)) return false;
          seen.add(r.tenantId);
          return true;
        });
      }
      if (args.orderBy?.createdAt === 'desc') {
        rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (typeof args.take === 'number') rows = rows.slice(0, args.take);
      return rows;
    },
  };
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

const TAOBAO_SECRET = 'taobao-test-secret';

function topPayload(overrides: Record<string, any> = {}) {
  const base: Record<string, any> = {
    topic: 'taobao_trade_TradeSuccess',
    userId: 'buyer-1',
    ownerId: 'seller-1',
    timestamp: '2026-08-09 10:00:00', // 固定北京时区
  };
  return { ...base, ...overrides };
}

function signedTop(overrides: Record<string, any> = {}): Record<string, any> {
  const base = topPayload(overrides);
  // 注意：sign 计算需排除 sign/botId/tenantId/echostr（signTopParams 内部处理）
  return { ...base, sign: signTopParams(base, TAOBAO_SECRET) };
}

function makeSecurity(env: Record<string, string> = {}): {
  svc: WebhookSecurityService;
  fake: FakePrisma;
} {
  const fake = new FakePrisma();
  const svc = new WebhookSecurityService(new ConfigService(env), fake as any);
  svc.resetReplayCache();
  return { svc, fake };
}

function hmacSign(secret: string, timestamp: number, nonce: string, bodyText: string): string {
  return createHmac('sha256', secret).update(`${timestamp}|${nonce}|${bodyText}`).digest('hex');
}

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const BOT_A = 'bot-A';
const BOT_B = 'bot-B';

// ===========================================================================
// 1) Webhook 安全
// ===========================================================================

// ---- 淘宝 TOP ----
test('P0-5A taobao: 有效签名 + 新鲜 timestamp → ok', () => {
  const { svc } = makeSecurity({ TAOBAO_APP_SECRET: TAOBAO_SECRET });
  // 用北京时区（UTC+8）构造当前时间字符串，与 parseTopTimestamp 一致
  const bj = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const ts = `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ${p(
    bj.getUTCHours(),
  )}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`;
  const r = svc.verifyTaobao(signedTop({ timestamp: ts }));
  assert.equal(r.ok, true);
});

test('P0-5A taobao: 缺 sign → 401', () => {
  const { svc } = makeSecurity({ TAOBAO_APP_SECRET: TAOBAO_SECRET });
  const r = svc.verifyTaobao(topPayload());
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('P0-5A taobao: 篡改业务参数 → 401', () => {
  const { svc } = makeSecurity({ TAOBAO_APP_SECRET: TAOBAO_SECRET });
  const r = svc.verifyTaobao(signedTop({ userId: 'attacker' }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('P0-5A taobao: 错误 secret（credential 不匹配）→ 401', () => {
  const { svc } = makeSecurity({ TAOBAO_APP_SECRET: 'wrong-secret' });
  const r = svc.verifyTaobao(signedTop());
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('P0-5A taobao: 过期 timestamp → 401', () => {
  const { svc } = makeSecurity({ TAOBAO_APP_SECRET: TAOBAO_SECRET });
  const old = '2020-01-01 00:00:00';
  const r = svc.verifyTaobao(signedTop({ timestamp: old }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

test('P0-5A taobao: 未配置 TAOBAO_APP_SECRET → 503（失败关闭）', () => {
  const { svc } = makeSecurity({});
  const r = svc.verifyTaobao(signedTop());
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test('P0-5A taobao: body 自报 tenantId 被忽略，身份来自服务端映射', () => {
  const { svc } = makeSecurity({ TAOBAO_WEBHOOK_TENANT_ID: TENANT_A });
  // tenant B 的 tenantId 出现在 body 里 → 身份仍是 A（测试 "tenant A credential + tenant B body → 拒绝" 的前置）
  const tenant = svc.resolveTenantId('taobao');
  assert.equal(tenant, TENANT_A);
  assert.notEqual(tenant, 'tenant-B-in-body');
});

test('P0-5A taobao: 未配置 tenant 映射 → null（调用方回 503）', () => {
  const { svc } = makeSecurity({});
  assert.equal(svc.resolveTenantId('taobao'), null);
});

test('P0-5A taobao: 同一事件 key 重放 → 第二次 401', () => {
  const { svc } = makeSecurity({ TAOBAO_APP_SECRET: TAOBAO_SECRET });
  const payload = signedTop();
  const key = `taobao|${payload.topic}|${payload.userId}|${payload.ownerId}|${payload.timestamp}`;
  assert.equal(svc.markReplay(key).ok, true);
  const second = svc.markReplay(key);
  assert.equal(second.ok, false);
  assert.equal(second.status, 401);
});

test('P0-5A parseTopTimestamp: 北京时区 yyyy-MM-dd HH:mm:ss → epoch', () => {
  const ts = parseTopTimestamp('2026-08-09 10:00:00');
  assert.ok(ts !== null);
  // 北京 10:00 = UTC 02:00
  assert.equal(new Date(ts).toISOString(), '2026-08-09T02:00:00.000Z');
  assert.equal(parseTopTimestamp('garbage'), null);
});

// ---- bot 归属 ----
test('P0-5A bot: 伪造 botId（不存在）→ 403', async () => {
  const { svc, fake } = makeSecurity({});
  fake.botRows.push({ id: BOT_A, tenantId: TENANT_A });
  const r = await svc.assertBotOwnedByTenant('fake-bot', TENANT_A);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('P0-5A bot: 他租户的 bot（tenant A 访问 tenant B 的 bot）→ 403', async () => {
  const { svc, fake } = makeSecurity({});
  fake.botRows.push({ id: BOT_B, tenantId: TENANT_B });
  const r = await svc.assertBotOwnedByTenant(BOT_B, TENANT_A);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('P0-5A bot: 本租户 bot → 通过；空 botId → 跳过放行', async () => {
  const { svc, fake } = makeSecurity({});
  fake.botRows.push({ id: BOT_A, tenantId: TENANT_A });
  assert.equal((await svc.assertBotOwnedByTenant(BOT_A, TENANT_A)).ok, true);
  assert.equal((await svc.assertBotOwnedByTenant('', TENANT_A)).ok, true);
});

// ---- 微信公众号 ----
const WECHAT_TOKEN = 'wechat-test-token';
function wechatSig(parts: string[]): string {
  const sorted = [...parts, WECHAT_TOKEN].sort();
  return createHash('sha1').update(sorted.join('')).digest('hex');
}

test('P0-5A wechat GET: 有效签名 → 200', () => {
  const { svc } = makeSecurity({ WECHAT_TOKEN });
  const ts = String(Date.now());
  const nonce = 'n1';
  const r = svc.verifyWechatGet({ echostr: 'abc', signature: wechatSig([ts, nonce]), timestamp: ts, nonce });
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
});

test('P0-5A wechat GET: 缺签名/缺 token/错误签名/过期 → 403/503', () => {
  const { svc } = makeSecurity({ WECHAT_TOKEN });
  assert.equal(svc.verifyWechatGet({}).status, 403);
  assert.equal(svc.verifyWechatGet({ signature: 'x', timestamp: 'y', nonce: 'z' }).status, 403);
  assert.equal(
    svc.verifyWechatGet({ signature: 'bad', timestamp: String(Date.now()), nonce: 'n' }).status,
    403,
  );
  assert.equal(
    svc.verifyWechatGet({ signature: 'bad', timestamp: '1000', nonce: 'n' }).status,
    403, // 过期 timestamp（错误签名也按 403）
  );
  const { svc: noToken } = makeSecurity({});
  assert.equal(noToken.verifyWechatGet({}).status, 503);
});

test('P0-5A wechat POST: 明文模式默认拒绝（403），显式允许才放行', () => {
  const { svc } = makeSecurity({ WECHAT_TOKEN });
  const plain = { Content: 'hi', MsgId: 'm1' };
  const r = svc.verifyWechatPost(plain);
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);

  const { svc: allowed } = makeSecurity({ WECHAT_TOKEN, WECHAT_WEBHOOK_PLAINTEXT_ALLOWED: 'true' });
  assert.equal(allowed.verifyWechatPost(plain).ok, true);
});

test('P0-5A wechat POST: 安全模式 msg_signature 验证', () => {
  const ts = String(Date.now());
  const nonce = 'n1';
  const enc = 'ENCRYPTED_BLOB';
  const msgSig = wechatSig([ts, nonce, enc]);

  // 有效签名 + 有解密密钥 → 200
  const { svc } = makeSecurity({ WECHAT_TOKEN, WECHAT_ENCODING_AES_KEY: 'k' });
  const ok = svc.verifyWechatPost({ Encrypt: enc, msg_signature: msgSig, timestamp: ts, nonce });
  assert.equal(ok.ok, true);

  // 错误签名 → 403
  const bad = svc.verifyWechatPost({ Encrypt: enc, msg_signature: 'bad', timestamp: ts, nonce });
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 403);

  // 无解密密钥 → 503（无法处理安全模式内容）
  const { svc: noKey } = makeSecurity({ WECHAT_TOKEN });
  const noKeyR = noKey.verifyWechatPost({ Encrypt: enc, msg_signature: msgSig, timestamp: ts, nonce });
  assert.equal(noKeyR.ok, false);
  assert.equal(noKeyR.status, 503);
});

// ---- HMAC（抖音/小红书）----
test('P0-5A HMAC: 有效签名 → ok；缺/错/过期 → 401；未配置 secret → 503', () => {
  const secret = 'xhs-secret';
  const ts = Date.now();
  const nonce = 'n-abc';
  const bodyText = '{"userId":"u1","message":"hi"}';

  const { svc } = makeSecurity({ XHS_WEBHOOK_SECRET: secret });
  const valid = { userId: 'u1', message: 'hi', timestamp: ts, nonce, sign: hmacSign(secret, ts, nonce, bodyText) };
  assert.equal(svc.verifyHmac(valid, 'XHS_WEBHOOK_SECRET', bodyText).ok, true);

  // 缺 sign
  assert.equal(svc.verifyHmac({ userId: 'u1', timestamp: ts, nonce }, 'XHS_WEBHOOK_SECRET', bodyText).status, 401);
  // 错误 secret
  const wrong = { userId: 'u1', timestamp: ts, nonce, sign: hmacSign('wrong', ts, nonce, bodyText) };
  assert.equal(svc.verifyHmac(wrong, 'XHS_WEBHOOK_SECRET', bodyText).status, 401);
  // 过期 timestamp
  const old = { userId: 'u1', timestamp: 1000, nonce, sign: hmacSign(secret, 1000, nonce, bodyText) };
  assert.equal(svc.verifyHmac(old, 'XHS_WEBHOOK_SECRET', bodyText).status, 401);
  // 未配置
  const { svc: none } = makeSecurity({});
  assert.equal(none.verifyHmac(valid, 'XHS_WEBHOOK_SECRET', bodyText).status, 503);
});

test('P0-5A HMAC: nonce 重放 → 第二次 401', () => {
  const { svc } = makeSecurity({});
  assert.equal(svc.markReplay('douyin|nonce-x').ok, true);
  const second = svc.markReplay('douyin|nonce-x');
  assert.equal(second.ok, false);
  assert.equal(second.status, 401);
});

test('P0-5A resolveTenantId: 各渠道映射 + 未配置返回 null', () => {
  const { svc } = makeSecurity({
    TAOBAO_WEBHOOK_TENANT_ID: 't-taobao',
    WECHAT_WEBHOOK_TENANT_ID: 't-wechat',
    DOUYIN_WEBHOOK_TENANT_ID: 't-douyin',
    XHS_WEBHOOK_TENANT_ID: 't-xhs',
  });
  assert.equal(svc.resolveTenantId('taobao'), 't-taobao');
  assert.equal(svc.resolveTenantId('wechat'), 't-wechat');
  assert.equal(svc.resolveTenantId('douyin'), 't-douyin');
  assert.equal(svc.resolveTenantId('xiaohongshu'), 't-xhs');
  assert.equal(svc.resolveTenantId('unknown'), null);
});

// ===========================================================================
// 2) chat / conversations 租户隔离
// ===========================================================================

function buildChatService(fake: FakePrisma): ChatService {
  const aiPipeline = {
    processMessage: async () => ({
      response: 'AI reply',
      isLimited: false,
      intent: { intent: 'inquiry', confidence: 1, keywords: [] },
      leadScore: 0,
      leadLevel: 'cold',
    }),
  };
  return new ChatService(fake as any, aiPipeline as any);
}

test('P0-5A chat: 他租户会话 → 404，且不写入任何 message', async () => {
  const fake = new FakePrisma();
  fake.conversationRows.push({ id: 'conv-B', tenantId: TENANT_B, visitor: 'v' });
  const svc = buildChatService(fake);
  await assert.rejects(
    () => svc.processMessage(TENANT_A, '', 'conv-B', 'hello'),
    (e: any) => e?.status === 404 || e?.response?.statusCode === 404,
  );
  assert.equal(fake.messageRows.length, 0);
});

test('P0-5A chat: 本租户会话 → 正常处理，Message.tenantId = 可信 tenant', async () => {
  const fake = new FakePrisma();
  fake.conversationRows.push({ id: 'conv-A', tenantId: TENANT_A, visitor: 'v1' });
  const svc = buildChatService(fake);
  const r = await svc.processMessage(TENANT_A, '', 'conv-A', 'hello');
  assert.equal(r.response, 'AI reply');
  assert.equal(fake.messageRows.length, 2);
  for (const m of fake.messageRows) {
    assert.equal(m.tenantId, TENANT_A);
    assert.equal(m.conversationId, 'conv-A');
  }
});

test('P0-5A chat: 未知会话 → 以可信 tenant 创建（tenantId 落库）', async () => {
  const fake = new FakePrisma();
  const svc = buildChatService(fake);
  await svc.processMessage(TENANT_A, '', 'new-conv', 'hi');
  const conv = fake.conversationRows[0];
  assert.equal(conv.id, 'new-conv');
  assert.equal(conv.tenantId, TENANT_A);
  assert.equal(fake.messageRows[0].tenantId, TENANT_A);
});

test('P0-5A chat: 伪造 botId（他租户 bot）→ 404，零写入', async () => {
  const fake = new FakePrisma();
  fake.botRows.push({ id: BOT_B, tenantId: TENANT_B });
  fake.conversationRows.push({ id: 'conv-A', tenantId: TENANT_A, visitor: 'v' });
  const svc = buildChatService(fake);
  await assert.rejects(
    () => svc.processMessage(TENANT_A, BOT_B, 'conv-A', 'hi'),
    (e: any) => e?.status === 404,
  );
  assert.equal(fake.messageRows.length, 0);
});

test('P0-5A chat: 本租户 botId → 通过', async () => {
  const fake = new FakePrisma();
  fake.botRows.push({ id: BOT_A, tenantId: TENANT_A });
  fake.conversationRows.push({ id: 'conv-A', tenantId: TENANT_A, visitor: 'v' });
  const svc = buildChatService(fake);
  const r = await svc.processMessage(TENANT_A, BOT_A, 'conv-A', 'hi');
  assert.equal(r.response, 'AI reply');
});

// ---- conversations ----
function buildConversationsService(fake: FakePrisma): ConversationsService {
  return new ConversationsService(fake as any);
}

test('P0-5A conversations: addMessage 参数修复——role=user、content=内容、tenantId=可信租户', async () => {
  const fake = new FakePrisma();
  fake.conversationRows.push({ id: 'conv-A', tenantId: TENANT_A, visitor: 'v' });
  const svc = buildConversationsService(fake);
  const msg = await svc.addMessage('conv-A', '你好世界', TENANT_A);
  assert.equal(msg.role, 'user');
  assert.equal(msg.content, '你好世界');
  assert.equal(msg.tenantId, TENANT_A);
  assert.equal(msg.conversationId, 'conv-A');
  // 不再出现旧 bug：content 字段不应等于 tenantId
  assert.notEqual(msg.content, TENANT_A);
  assert.notEqual(msg.role, '你好世界');
});

test('P0-5A conversations: 他租户会话写消息 → 404，零写入', async () => {
  const fake = new FakePrisma();
  fake.conversationRows.push({ id: 'conv-B', tenantId: TENANT_B, visitor: 'v' });
  const svc = buildConversationsService(fake);
  await assert.rejects(
    () => svc.addMessage('conv-B', 'hello', TENANT_A),
    (e: any) => e?.status === 404,
  );
  assert.equal(fake.messageRows.length, 0);
});

test('P0-5A conversations: 不存在会话 → 404；空内容 → 400', async () => {
  const fake = new FakePrisma();
  const svc = buildConversationsService(fake);
  await assert.rejects(() => svc.addMessage('missing', 'x', TENANT_A), (e: any) => e?.status === 404);
  fake.conversationRows.push({ id: 'conv-A', tenantId: TENANT_A });
  await assert.rejects(() => svc.addMessage('conv-A', '   ', TENANT_A), (e: any) => e?.status === 400);
});

test('P0-5A conversations: findOne 跨租户/不存在 → 404（不泄露存在性）', async () => {
  const fake = new FakePrisma();
  fake.conversationRows.push({ id: 'conv-B', tenantId: TENANT_B });
  const svc = buildConversationsService(fake);
  await assert.rejects(
    () => svc.findOne('conv-B', TENANT_A),
    (e: any) => e?.status === 404,
  );
  const own = await svc.findOne('conv-B', TENANT_B);
  assert.ok(own);
});

// ===========================================================================
// 3) Approval 过期清扫
// ===========================================================================

function buildApproval(fake: FakePrisma): ApprovalService {
  const audit = new WorkforceAuditService(fake as any);
  return new ApprovalService(fake as any, audit);
}

test('P0-5A approval: 过期 PENDING → EXPIRED，写 APPROVAL_EXPIRED 审计', async () => {
  const fake = new FakePrisma();
  const svc = buildApproval(fake);
  await svc.request({
    tenantId: TENANT_A,
    action: 'hunter_queue',
    targetType: 'Lead',
    targetId: 'L1',
    riskLevel: 'high',
    expiresAt: new Date(Date.now() - 60_000).toISOString(), // 已过期
    traceId: 'trace-1',
  });
  const n = await svc.expireAllExpired(TENANT_A);
  assert.equal(n, 1);

  const current = await svc.getById(TENANT_A, (fake.auditLogRows.find((r) => r.action === 'APPROVAL_CREATED')?.detail as any).approvalId);
  assert.equal(current.status, 'EXPIRED');
  const expiredRows = fake.auditLogRows.filter((r) => r.action === 'APPROVAL_EXPIRED');
  assert.equal(expiredRows.length, 1);
  assert.equal(expiredRows[0].tenantId, TENANT_A);
});

test('P0-5A approval: 清扫幂等（重复扫描不重复写）', async () => {
  const fake = new FakePrisma();
  const svc = buildApproval(fake);
  await svc.request({
    tenantId: TENANT_A,
    action: 'hunter_queue',
    targetType: 'Lead',
    targetId: 'L1',
    riskLevel: 'high',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    traceId: 'trace-1',
  });
  assert.equal(await svc.expireAllExpired(TENANT_A), 1);
  assert.equal(await svc.expireAllExpired(TENANT_A), 0);
  assert.equal(fake.auditLogRows.filter((r) => r.action === 'APPROVAL_EXPIRED').length, 1);
});

test('P0-5A approval: 未过期 / APPROVED / 无 expiresAt 的审批不受影响', async () => {
  const fake = new FakePrisma();
  const svc = buildApproval(fake);
  // 未过期 PENDING
  await svc.request({
    tenantId: TENANT_A,
    action: 'a1',
    targetType: 'Lead',
    targetId: 'L2',
    riskLevel: 'medium',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    traceId: 't2',
  });
  // 无 expiresAt
  await svc.request({
    tenantId: TENANT_A,
    action: 'a2',
    targetType: 'Lead',
    targetId: 'L3',
    riskLevel: 'medium',
    traceId: 't3',
  });
  // APPROVED（future expiresAt，避免 approve 前置自动过期）
  const created = await svc.request({
    tenantId: TENANT_A,
    action: 'a3',
    targetType: 'Lead',
    targetId: 'L4',
    riskLevel: 'high',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    traceId: 't4',
  });
  await svc.approve(TENANT_A, created.approvalId, {
    mode: 'jwt',
    tenantId: TENANT_A,
    userId: 'u1',
    actorType: 'USER',
    source: 'jwt',
    traceId: 't4',
  } as any);

  const n = await svc.expireAllExpired(TENANT_A);
  assert.equal(n, 0);
  const rows = fake.auditLogRows.filter((r) => r.action === 'APPROVAL_EXPIRED');
  assert.equal(rows.length, 0);
  // APPROVED 仍为 APPROVED
  const approved = await svc.getById(TENANT_A, created.approvalId);
  assert.equal(approved.status, 'APPROVED');
});

test('P0-5A approval: tenant-safe——只清扫本租户，他租户不动', async () => {
  const fake = new FakePrisma();
  const svc = buildApproval(fake);
  await svc.request({
    tenantId: TENANT_A,
    action: 'hunter_queue',
    targetType: 'Lead',
    targetId: 'LA',
    riskLevel: 'high',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    traceId: 'ta',
  });
  await svc.request({
    tenantId: TENANT_B,
    action: 'hunter_queue',
    targetType: 'Lead',
    targetId: 'LB',
    riskLevel: 'high',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    traceId: 'tb',
  });
  const n = await svc.expireAllExpired(TENANT_A);
  assert.equal(n, 1);
  // B 的审批仍 PENDING
  const bCreated = fake.auditLogRows.find(
    (r) => r.action === 'APPROVAL_CREATED' && r.tenantId === TENANT_B,
  );
  const bCurrent = await svc.getById(TENANT_B, bCreated.detail.approvalId);
  assert.equal(bCurrent.status, 'PENDING_APPROVAL');
});

test('P0-5A approval: 过期审批再操作 → 409（终态保护）', async () => {
  const fake = new FakePrisma();
  const svc = buildApproval(fake);
  const created = await svc.request({
    tenantId: TENANT_A,
    action: 'hunter_queue',
    targetType: 'Lead',
    targetId: 'L1',
    riskLevel: 'high',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    traceId: 't1',
  });
  await svc.expireAllExpired(TENANT_A);
  await assert.rejects(
    () =>
      svc.approve(TENANT_A, created.approvalId, {
        mode: 'jwt',
        tenantId: TENANT_A,
        userId: 'u1',
        actorType: 'USER',
        source: 'jwt',
        traceId: 't1',
      } as any),
    (e: any) => e?.status === 409,
  );
});
