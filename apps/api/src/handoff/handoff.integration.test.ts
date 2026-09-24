/**
 * 转人工客服（Human Handoff）测试（REAL database）。
 *
 * 覆盖：
 *  1. ResponseGenerationService：兜底话术命中判定（单元）
 *  2. AiPipelineService：unknown 意图/低置信度 → 转人工 + 话术替换（集成，IntentService mock）
 *  3. AiPipelineService：正常意图 → 不转人工
 *  4. HandoffService.markHandoff / listPending / pendingCount / reply / resolve（集成）
 *  5. ServerChan 推送：stub global.fetch 断言标题/内容/URL（key 不出现在请求体明文之外）
 *  6. HANDOFF_ENABLED=false → 关闭转人工
 *  7. 人工回复写 agent 消息并标记已处理；widget history 读取归属校验
 *
 * Run: npx ts-node src/handoff/handoff.integration.test.ts
 */
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { ResponseGenerationService } from '../ai/pipeline/response-generation.service';
import { AiPipelineService } from '../ai/pipeline/ai-pipeline.service';
import { SalesStrategyService } from '../ai/pipeline/sales-strategy.service';
import { UsageService } from '../usage/usage.service';
import { CustomerMemoryService } from '../ai/pipeline/customer-memory.service';
import { LeadScoreService } from '../ai/pipeline/lead-score.service';
import { HandoffService } from './handoff.service';
import { ServerChanService } from './serverchan.service';
import { WidgetService } from '../widget/widget.service';

const prisma = new PrismaClient();

const mockConfig = {
  get: (key: string) => {
    switch (key) {
      case 'HANDOFF_ENABLED':
        return 'true';
      case 'HANDOFF_CONFIDENCE_THRESHOLD':
        return '0.5';
      case 'DASHBOARD_BASE_URL':
        return 'https://admin.wan-wan.xyz';
      case 'HANDOFF_MESSAGE':
        return undefined;
      default:
        return undefined;
    }
  },
} as unknown as ConfigService;

const createdTenantIds: string[] = [];

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createTestTenant(): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: { name: `handoff-test-${uniqueId('t')}` },
  });
  createdTenantIds.push(tenant.id);
  return tenant.id;
}

async function createTestBot(tenantId: string): Promise<string> {
  const bot = await prisma.bot.create({
    data: {
      name: `handoff-bot-${uniqueId('b')}`,
      tenantId,
    },
  });
  return bot.id;
}

async function createTestConversation(tenantId: string, botId: string, visitor: string) {
  return prisma.conversation.create({
    data: { botId, tenantId, visitor, channel: 'webchat' },
  });
}

async function cleanupTenant(tenantId: string) {
  try {
    const convs = await prisma.conversation.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const convIds = convs.map((c) => c.id);
    if (convIds.length) {
      await prisma.message.deleteMany({ where: { conversationId: { in: convIds } } });
      await prisma.conversation.deleteMany({ where: { id: { in: convIds } } });
    }
    await prisma.usage.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.lead.deleteMany({ where: { tenantId } });
    await prisma.bot.deleteMany({ where: { tenantId } });
    await prisma.subscription.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
  } catch (e) {
    // 清理尽力而为
    console.warn(`cleanup tenant ${tenantId} 部分失败: ${e.message}`);
  }
}

function buildHandoffService(): HandoffService {
  return new HandoffService(prisma as never, mockConfig, new ServerChanService());
}

// 与 STAFF-04 对齐：AiPipelineService 现依赖 AiQuotaService 的 assertCanRespond。
// 集成测试用最小 mock 提供该方法（不依赖真实订阅/额度逻辑）。
const fakeQuota: any = {
  assertCanRespond: async () => ({
    enabled: true,
    dailyLimit: 999,
    usedToday: 0,
    remaining: 999,
    resetsAt: new Date().toISOString(),
  }),
  consumeSuccessfulResponse: async () => {},
};

function buildPipeline(intentResult: { intent: string; confidence: number }) {
  const fakeIntent: any = {
    classifyIntent: async () => ({ ...intentResult, keywords: [] }),
  };
  const fakeRecommendation: any = {
    generateRecommendations: async () => ({ products: [] }),
  };
  const usage = new UsageService(prisma as never);
  const strategy = new SalesStrategyService();
  const responseGen = new ResponseGenerationService();
  const memory = new CustomerMemoryService(prisma as never);
  const leadScore = new LeadScoreService(prisma as never);
  const handoff = buildHandoffService();

  return new AiPipelineService(
    prisma as never,
    fakeIntent,
    memory,
    fakeRecommendation,
    leadScore,
    strategy,
    responseGen,
    handoff,
    fakeQuota,
  );
}

/** ServerChan 推送抓取：替换 global.fetch */
interface CapturedPush {
  url: string;
  title: string;
  desp: string;
}
const pushes: CapturedPush[] = [];

function stubFetch() {
  (global as any).__originalFetch = global.fetch;
  (global as any).fetch = async (url: any, init: any) => {
    if (typeof url === 'string' && url.includes('sctapi.ftqq.com')) {
      const body = new URLSearchParams(init?.body as string);
      pushes.push({ url, title: body.get('title') || '', desp: body.get('desp') || '' });
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, message: 'ok' }),
      } as any;
    }
    return (global as any).__originalFetch(url, init);
  };
}

function restoreFetch() {
  if ((global as any).__originalFetch) {
    (global as any).fetch = (global as any).__originalFetch;
    delete (global as any).__originalFetch;
  }
}

before(() => {
  // 测试用 ServerChan key（非生产凭据）
  process.env.SERVERCHAN_KEY = 'handoff-test-serverchan-key-0000';
  stubFetch();
});

after(async () => {
  restoreFetch();
  delete process.env.SERVERCHAN_KEY;
  for (const tenantId of createdTenantIds) {
    await cleanupTenant(tenantId);
  }
  await prisma.$disconnect();
});

/* ------------------------------------------------------------------ */
/* 1. ResponseGenerationService 兜底判定                                */
/* ------------------------------------------------------------------ */

test('Handoff: 兜底话术（default 分支无产品无知识）标记 fallback', () => {
  const gen = new ResponseGenerationService();
  const strategy = new SalesStrategyService().determineStrategy(
    { intent: 'unknown', confidence: 0.1, keywords: [] },
    null,
    [],
  );
  const r1 = gen.generate('unknown', strategy, { products: [] }, [], 'webchat');
  assert.equal(r1.fallback, true, 'unknown 意图兜底应标记 fallback');
  assert.ok(r1.text.length > 0);

  const r2 = gen.generate('greeting', strategy, { products: [] }, [], 'webchat');
  assert.equal(r2.fallback, false, 'greeting 不应标记 fallback');
  assert.match(r2.text, /很高兴为您服务/);
});

/* ------------------------------------------------------------------ */
/* 2. Pipeline：unknown 意图 → 转人工                                   */
/* ------------------------------------------------------------------ */

test('Handoff: unknown 意图触发转人工（标记 + 话术替换）', async () => {
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v')}`);

  const pipeline = buildPipeline({ intent: 'unknown', confidence: 0.1 });
  const result = await pipeline.processMessage(
    tenantId,
    botId,
    conv.id,
    'asdfqwerzxcv 完全无法理解的问题内容',
    undefined,
    'webchat',
  );

  assert.equal(result.needsHuman, true, '应标记需要人工');
  assert.match(result.response, /转接人工客服/, '回复应为转人工话术');

  const updated = await prisma.conversation.findUnique({ where: { id: conv.id } });
  assert.equal(updated!.needsHuman, true, 'DB needsHuman 应为 true');
  assert.equal(updated!.handoffReason, 'unknown_intent');
  assert.ok(updated!.handoffAt, '应记录转人工时间');

  // 转人工话术应作为 bot 消息落库
  const messages = await prisma.message.findMany({
    where: { conversationId: conv.id, role: 'bot' },
  });
  assert.ok(messages.some((m) => m.content.includes('转接人工客服')), 'bot 消息应为转人工话术');
});

/* ------------------------------------------------------------------ */
/* 3. Pipeline：正常意图 → 不转人工                                     */
/* ------------------------------------------------------------------ */

test('Handoff: 正常意图（greeting）不触发转人工', async () => {
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v2')}`);

  const pipeline = buildPipeline({ intent: 'greeting', confidence: 0.9 });
  const result = await pipeline.processMessage(tenantId, botId, conv.id, '你好', undefined, 'webchat');

  assert.equal(result.needsHuman, false);
  assert.ok(!result.response.includes('转接人工客服'));

  const updated = await prisma.conversation.findUnique({ where: { id: conv.id } });
  assert.equal(updated!.needsHuman, false);
  assert.equal(updated!.handoffAt, null);
});

/* ------------------------------------------------------------------ */
/* 4. HandoffService：工单/待办/回复/处理                               */
/* ------------------------------------------------------------------ */

test('Handoff: markHandoff + listPending + pendingCount', async () => {
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v3')}`);

  const svc = buildHandoffService();
  await svc.markHandoff(conv.id, tenantId, 'fallback_response');

  assert.equal(await svc.pendingCount(tenantId), 1);
  const pending = await svc.listPending(tenantId);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, conv.id);
  assert.equal(pending[0].handoffReason, 'fallback_response');

  // 其它租户不可见
  const otherTenant = await createTestTenant();
  assert.equal(await svc.pendingCount(otherTenant), 0);
});

test('Handoff: 人工回复写 agent 消息并标记已处理', async () => {
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v4')}`);

  const svc = buildHandoffService();
  await svc.markHandoff(conv.id, tenantId, 'unknown_intent');
  const msg = await svc.reply(conv.id, tenantId, '您好，我是人工客服小王，请问具体遇到了什么问题？', 'agent-user-1');

  assert.equal(msg.sender, 'agent');
  assert.equal(msg.role, 'agent');
  assert.equal(msg.direction, 'outbound');

  const updated = await prisma.conversation.findUnique({ where: { id: conv.id } });
  assert.equal(updated!.needsHuman, false, '回复后应解除转人工');
  assert.ok(updated!.resolvedAt, '应记录处理时间');
  assert.equal(await svc.pendingCount(tenantId), 0);

  // 空回复拒绝
  await assert.rejects(svc.reply(conv.id, tenantId, '   '), (e: any) => e?.response?.statusCode === 400 || e?.status === 400);
});

test('Handoff: resolve 标记已处理', async () => {
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v5')}`);

  const svc = buildHandoffService();
  await svc.markHandoff(conv.id, tenantId, 'low_confidence');
  const updated = await svc.resolve(conv.id, tenantId);
  assert.equal(updated.needsHuman, false);
  assert.ok(updated.resolvedAt);
});

/* ------------------------------------------------------------------ */
/* 5. ServerChan 推送                                                   */
/* ------------------------------------------------------------------ */

test('Handoff: notifyAdmin 推送标题/内容包含客户与问题，URL 使用 key', async () => {
  pushes.length = 0;
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v6')}`);

  const svc = buildHandoffService();
  await svc.notifyAdmin({
    conversationId: conv.id,
    tenantId,
    question: '你们的软件支持定制开发吗？支持私有化部署吗？',
  });

  assert.equal(pushes.length, 1, '应推送一次');
  const p = pushes[0];
  assert.ok(p.url.includes('sctapi.ftqq.com'), '应推送 Server酱');
  assert.ok(p.url.includes('handoff-test-serverchan-key-0000'), 'URL 应带测试 key');
  assert.match(p.title, /【转人工】/);
  assert.ok(p.title.includes(conv.visitor), '标题应包含客户标识');
  assert.ok(p.desp.includes('支持定制开发'), '内容应包含客户问题');
  assert.ok(p.desp.includes(`conversation=${conv.id}`), '内容应包含会话处理链接');
});

test('Handoff: 未配置 key 时静默跳过推送（不抛错）', async () => {
  delete process.env.SERVERCHAN_KEY;
  try {
    const svc = new HandoffService(prisma as never, mockConfig, new ServerChanService());
    const tenantId = await createTestTenant();
    const botId = await createTestBot(tenantId);
    const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v7')}`);
    await svc.notifyAdmin({ conversationId: conv.id, tenantId, question: '测试' }); // 不应抛错
    assert.ok(true);
  } finally {
    process.env.SERVERCHAN_KEY = 'handoff-test-serverchan-key-0000';
  }
});

/* ------------------------------------------------------------------ */
/* 6. HANDOFF_ENABLED=false → 不转人工                                  */
/* ------------------------------------------------------------------ */

test('Handoff: HANDOFF_ENABLED=false 关闭转人工', async () => {
  const disabledConfig = {
    get: (key: string) => (key === 'HANDOFF_ENABLED' ? 'false' : undefined),
  } as unknown as ConfigService;

  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v8')}`);

  const fakeIntent: any = { classifyIntent: async () => ({ intent: 'unknown', confidence: 0.1, keywords: [] }) };
  const fakeRecommendation: any = { generateRecommendations: async () => ({ products: [] }) };
  const pipeline = new AiPipelineService(
    prisma as never,
    fakeIntent,
    new CustomerMemoryService(prisma as never),
    fakeRecommendation,
    new LeadScoreService(prisma as never),
    new SalesStrategyService(),
    new ResponseGenerationService(),
    new HandoffService(prisma as never, disabledConfig, new ServerChanService()),
    fakeQuota,
  );

  const result = await pipeline.processMessage(tenantId, botId, conv.id, '完全不懂的问题xyz', undefined, 'webchat');
  assert.equal(result.needsHuman, false);
  const updated = await prisma.conversation.findUnique({ where: { id: conv.id } });
  assert.equal(updated!.needsHuman, false);
});

/* ------------------------------------------------------------------ */
/* 7. Widget：历史读取归属校验                                          */
/* ------------------------------------------------------------------ */

test('Handoff: widget history 归属校验（visitor 不匹配拒绝）', async () => {
  const tenantId = await createTestTenant();
  const botId = await createTestBot(tenantId);
  const conv = await createTestConversation(tenantId, botId, `visitor-${uniqueId('v9')}`);

  const svc = new WidgetService(prisma as never, null as never);
  await prisma.message.create({
    data: { conversationId: conv.id, content: '人工回复内容', role: 'agent', sender: 'agent', tenantId },
  });

  const history = await svc.history(conv.id, conv.visitor);
  assert.ok(history.length >= 1);
  assert.ok(history.some((m) => m.sender === 'agent' && m.content === '人工回复内容'));

  await assert.rejects(
    svc.history(conv.id, 'someone-else-visitor'),
    (e: any) => e?.response?.statusCode === 403 || e?.status === 403,
  );
});
