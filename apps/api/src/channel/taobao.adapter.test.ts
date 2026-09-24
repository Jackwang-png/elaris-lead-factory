/**
 * 千牛/淘宝渠道适配器测试 —— TOP 签名验签 / 千牛消息解析 / 发送降级与真实调用（fetch mock）。
 *
 * 说明：仓库测试基线（153/153）使用 node:test + ts-node（run-all-tests.js），
 * 本文件沿用同一风格（*.test.ts 会被自动收集，且被 nest build 排除）。
 *
 * Run: npx ts-node src/channel/taobao.adapter.test.ts
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';

import { TaobaoAdapter } from './taobao.adapter';
import {
  buildTopSignString,
  signTopParams,
  signTopParamsUpper,
  verifyTopSign,
  formatTopTimestamp,
  TOP_GATEWAY,
} from './taobao.signature';
import { ChannelService } from './channel.service';

const SECRET = 'test_secret_taobao_abc123'; // test-only; 真实凭证只存在于 .env

/* ------------------------------------------------------------------ */
/* TOP 签名算法                                                        */
/* ------------------------------------------------------------------ */

test('TOP sign string: excludes sign/empty/custom params, ASCII sorted, key+value concat', () => {
  const params = {
    timestamp: '2026-08-09 00:00:00',
    userId: '1001',
    sign: 'x',
    topic: 'taobao_trade_TradeSuccess',
    ownerId: '2002',
    empty: '',
    botId: 'b1',
    tenantId: 't1',
    echostr: 'e',
  };
  const s = buildTopSignString(params);
  assert.ok(!s.includes('sign='), 'sign must be excluded');
  assert.ok(!s.includes('empty='), 'empty values must be excluded');
  assert.ok(!s.includes('botId'), 'custom botId must be excluded');
  assert.ok(!s.includes('tenantId'), 'custom tenantId must be excluded');
  assert.ok(!s.includes('echostr'), 'echostr must be excluded');
  // ASCII 升序：ownerId < timestamp < topic < userId，key+value 无分隔符
  assert.equal(s, 'ownerId2002timestamp2026-08-09 00:00:00topictaobao_trade_TradeSuccessuserId1001');
});

test('TOP sign: md5(secret + sortedConcat + secret), 32-hex lowercase', () => {
  const params = {
    topic: 'taobao_trade_TradeSuccess',
    userId: '123',
    ownerId: '456',
    timestamp: '2026-08-09 10:00:00',
  };
  const s = buildTopSignString(params);
  const expected = createHash('md5').update(SECRET + s + SECRET).digest('hex');
  const actual = signTopParams(params, SECRET);
  assert.equal(actual, expected);
  assert.equal(actual.length, 32);
  assert.equal(actual, actual.toLowerCase());
});

test('TOP sign upper: official SDK uppercase form for API calls', () => {
  const params = { method: 'taobao.openim.immsg.push', app_key: 'k123', timestamp: '2026-08-09 00:00:00' };
  const upper = signTopParamsUpper(params, SECRET);
  assert.equal(upper, signTopParams(params, SECRET).toUpperCase());
  assert.equal(upper.length, 32);
  assert.equal(upper, upper.toUpperCase());
});

test('TOP verify: valid passes, tampered/wrong-secret/missing fail, case-insensitive', () => {
  const base = { topic: 'taobao_trade_TradeSuccess', userId: '1', ownerId: '2', timestamp: '2026-08-09 00:00:00' };
  // 合法（小写）
  assert.equal(verifyTopSign({ ...base, sign: signTopParams(base, SECRET) }, SECRET), true);
  // 兼容官方 SDK 大写签名
  assert.equal(verifyTopSign({ ...base, sign: signTopParamsUpper(base, SECRET) }, SECRET), true);
  // 篡改业务参数
  assert.equal(verifyTopSign({ ...base, userId: '999', sign: signTopParams(base, SECRET) }, SECRET), false);
  // 篡改签名本身
  assert.equal(verifyTopSign({ ...base, sign: signTopParams(base, SECRET).slice(0, 31) + '0' }, SECRET), false);
  // 错误 secret
  assert.equal(verifyTopSign({ ...base, sign: signTopParams(base, SECRET) }, 'wrong_secret'), false);
  // 缺 sign / 缺 secret
  assert.equal(verifyTopSign(base, SECRET), false);
  assert.equal(verifyTopSign({ ...base, sign: 'a'.repeat(32) }, ''), false);
});

test('TOP timestamp: Beijing time yyyy-MM-dd HH:mm:ss', () => {
  const d = new Date('2026-08-09T02:00:00Z'); // UTC 02:00 = 北京 10:00
  assert.equal(formatTopTimestamp(d), '2026-08-09 10:00:00');
});

/* ------------------------------------------------------------------ */
/* verifyWebhook（无凭证降级 / 严格模式）                                */
/* ------------------------------------------------------------------ */

function makeAdapter(env: Record<string, string> = {}): TaobaoAdapter {
  return new TaobaoAdapter(new ConfigService(env));
}

test('verifyWebhook: 无凭证 → 拒绝（P0-5A 验签强制、失败关闭）', () => {
  const adapter = makeAdapter({});
  assert.equal(adapter.verifyWebhook({ whatever: 1 }), false);
});

test('verifyWebhook: 有凭证正确验签通过；错误签名一律拒绝（无宽松模式）', () => {
  const base = { topic: 'taobao_trade_TradeSuccess', userId: '1', ownerId: '2', timestamp: '2026-08-09 00:00:00' };
  const valid = { ...base, sign: signTopParams(base, SECRET) };

  const adapter = makeAdapter({ TAOBAO_APP_SECRET: SECRET });
  assert.equal(adapter.verifyWebhook(valid), true);
  // 错误签名：无论是否配置 TAOBAO_WEBHOOK_STRICT 一律拒绝（宽松模式已移除）
  assert.equal(adapter.verifyWebhook({ ...base, sign: 'deadbeef'.padEnd(32, '0') }), false);
  const withStrictEnv = makeAdapter({ TAOBAO_APP_SECRET: SECRET, TAOBAO_WEBHOOK_STRICT: 'true' });
  assert.equal(withStrictEnv.verifyWebhook({ ...base, sign: 'deadbeef'.padEnd(32, '0') }), false);
});

/* ------------------------------------------------------------------ */
/* processMessage（千牛/消息服务多种推送格式解析）                        */
/* ------------------------------------------------------------------ */

test('processMessage: 通用文本消息', async () => {
  const adapter = makeAdapter({});
  const msg = await adapter.processMessage(
    { content: '你好', senderId: 'buyer_1', msgId: 'm1', type: 'text' },
    'bot1',
    't1',
  );
  assert.ok(msg);
  assert.equal(msg.content, '你好');
  assert.equal(msg.sender, 'buyer_1');
  assert.equal(msg.platformId, 'buyer_1');
  assert.equal(msg.metadata.msgType, 'text');
});

test('processMessage: 消息服务 trade 推送（content 为 JSON 字符串，会话以 tid 为维度）', async () => {
  const adapter = makeAdapter({});
  const content = JSON.stringify({ tid: 'T123456', buyer_nick: '买家小王', status: 'WAIT_BUYER_PAY' });
  const msg = await adapter.processMessage(
    { topic: 'taobao_trade_TradeSuccess', userId: '1001', ownerId: '1002', timestamp: '2026-08-09 00:00:00', content },
    'bot1',
    't1',
  );
  assert.ok(msg);
  assert.equal(msg.metadata.raw.tid, 'T123456'); // 业务字段摊平在 raw
  assert.equal(msg.sender, '买家小王'); // buyer_nick 识别买家
  assert.equal(msg.platformId, 'T123456'); // 会话维度 = tid
  assert.ok(msg.content.length > 0); // 交易数据透传为内容
});

test('processMessage: 千牛消息 content 对象 + 图片类型', async () => {
  const adapter = makeAdapter({});
  const msg = await adapter.processMessage(
    {
      msgId: 'q1',
      buyerNick: '买家小李',
      msgType: 'image',
      content: { pic_url: 'https://img.alicdn.com/xx.jpg' },
      conversationId: 'buyer_小李',
    },
    'bot1',
    't1',
  );
  assert.ok(msg);
  assert.equal(msg.content, 'https://img.alicdn.com/xx.jpg');
  assert.equal(msg.metadata.msgType, 'image');
  assert.equal(msg.platformId, 'buyer_小李');
});

test('processMessage: 千牛消息 content 对象含 text', async () => {
  const adapter = makeAdapter({});
  const msg = await adapter.processMessage(
    { msgId: 'q2', buyerNick: '买家小张', content: { text: '在吗？' } },
    'bot1',
    't1',
  );
  assert.ok(msg);
  assert.equal(msg.content, '在吗？');
  assert.equal(msg.sender, '买家小张');
});

test('processMessage: 空内容返回 null（不产生脏数据）', async () => {
  const adapter = makeAdapter({});
  assert.equal(await adapter.processMessage({}, 'b', 't'), null);
  assert.equal(await adapter.processMessage({ content: '', senderId: 'x' }, 'b', 't'), null);
});

/* ------------------------------------------------------------------ */
/* sendMessage（无凭证降级 / 有凭证真实 TOP 调用）                        */
/* ------------------------------------------------------------------ */

test('sendMessage: 无凭证降级，不发起网络请求、不抛错', async () => {
  const adapter = makeAdapter({});
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('should not be called without credentials');
  });
  try {
    await assert.doesNotReject(() => adapter.sendMessage('buyer_1', '您好'));
    assert.equal(fetchMock.mock.callCount(), 0);
  } finally {
    fetchMock.mock.restore();
  }
});

test('sendMessage: 有凭证时调用 TOP 网关，签名与公共参数正确（fetch mock）', async () => {
  const adapter = makeAdapter({
    TAOBAO_APP_KEY: 'k123',
    TAOBAO_APP_SECRET: SECRET,
    TAOBAO_ACCESS_TOKEN: 'tok_abc',
  });
  let captured: { url: string; init: RequestInit } | null = null;
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    captured = { url, init };
    return new Response(JSON.stringify({ immsg_push_response: { immsg: {} } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  try {
    await adapter.sendMessage('buyer_1', '您好，很高兴为您服务');
    assert.ok(captured, 'fetch 必须被调用');
    assert.equal(captured.url, TOP_GATEWAY);
    const body = new URLSearchParams(captured.init.body as string);
    assert.equal(body.get('method'), 'taobao.openim.immsg.push');
    assert.equal(body.get('app_key'), 'k123');
    assert.equal(body.get('session'), 'tok_abc');
    assert.equal(body.get('format'), 'json');
    assert.equal(body.get('v'), '2.0');
    assert.equal(body.get('sign_method'), 'md5');
    assert.equal(body.get('userid'), 'buyer_1');
    const immsg = JSON.parse(body.get('immsg') as string);
    assert.equal(immsg.type, 'text');
    assert.equal(immsg.content, '您好，很高兴为您服务');
    // 签名可用同一套算法独立复核
    const params: Record<string, string> = {};
    for (const [k, v] of body.entries()) params[k] = v;
    const sign = body.get('sign');
    assert.ok(sign && sign.length === 32);
    assert.equal(sign, signTopParamsUpper(params, SECRET));
  } finally {
    fetchMock.mock.restore();
  }
});

test('sendMessage: TOP 返回 error_response（权限不足等）不抛错，仅记日志', async () => {
  const adapter = makeAdapter({
    TAOBAO_APP_KEY: 'k',
    TAOBAO_APP_SECRET: SECRET,
    TAOBAO_ACCESS_TOKEN: 'tok',
  });
  const fetchMock = mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({ error_response: { code: 15, msg: 'Remote service error', sub_msg: '权限不足' } }),
        { status: 200 },
      ),
  );
  try {
    await assert.doesNotReject(() => adapter.sendMessage('buyer_1', 'hi'));
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
  }
});

/* ------------------------------------------------------------------ */
/* ChannelService 闭环（验签失败返回 / AI 回复回发）                      */
/* ------------------------------------------------------------------ */

function stubAdapter(name: string): any {
  return {
    channelName: name,
    receiveMessage: async () => null,
    sendMessage: async () => {},
    verifyWebhook: () => true,
    getCustomer: async () => ({}),
    syncCustomer: async () => ({}),
    processMessage: async (m: any) => ({
      id: '1',
      content: '',
      sender: '',
      timestamp: new Date(),
      platformId: '',
    }),
  };
}

function stubAi(result: any): any {
  return {
    findOrCreateCustomer: async () => ({ id: 'cust_1' }),
    processMessage: async () => result,
  };
}

function makeService(taobao: TaobaoAdapter, aiResult: any): ChannelService {
  return new ChannelService(
    stubAdapter('webchat'),
    stubAdapter('wechat'),
    taobao,
    stubAdapter('wecom'),
    {} as any,
    stubAi(aiResult),
    {} as any,
  );
}

test('ChannelService: 严格模式验签失败 → { ok:false, verified:false }', async () => {
  const taobao = makeAdapter({ TAOBAO_APP_SECRET: SECRET, TAOBAO_WEBHOOK_STRICT: 'true' });
  const service = makeService(taobao, { response: 'ok', isLimited: false });
  service.onModuleInit();
  const res = await service.processIncomingMessage('taobao', { topic: 'x', sign: 'bad' }, 'b', 't');
  assert.equal(res.ok, false);
  assert.equal(res.verified, false);
});

test('ChannelService: 处理成功后调用 adapter.sendMessage 把 AI 回复发回千牛', async () => {
  // P0-5A：适配器验签强制，必须带有效 TOP 签名
  const taobao = makeAdapter({ TAOBAO_APP_SECRET: SECRET });
  const sent: Array<[string, string]> = [];
  taobao.sendMessage = async (cid: string, content: string) => {
    sent.push([cid, content]);
  };
  const service = makeService(taobao, { response: 'AI 回复内容', isLimited: false });
  service.onModuleInit();
  const payload = { content: '你好', senderId: 'buyer_1', msgId: 'm1' };
  const res = await service.processIncomingMessage(
    'taobao',
    { ...payload, sign: signTopParams(payload, SECRET) },
    'b',
    't',
  );
  assert.equal(res.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], 'buyer_1'); // conversationId = platformId
  assert.equal(sent[0][1], 'AI 回复内容');
});

test('ChannelService: AI 处理出错时不回发消息', async () => {
  const taobao = makeAdapter({ TAOBAO_APP_SECRET: SECRET });
  const sent: Array<[string, string]> = [];
  taobao.sendMessage = async (cid: string, content: string) => {
    sent.push([cid, content]);
  };
  const service = makeService(taobao, { response: '抱歉，出错了', isLimited: false, error: 'boom' });
  service.onModuleInit();
  const payload = { content: '你好', senderId: 'buyer_1', msgId: 'm1' };
  const res = await service.processIncomingMessage(
    'taobao',
    { ...payload, sign: signTopParams(payload, SECRET) },
    'b',
    't',
  );
  assert.equal(res.ok, true);
  assert.equal(sent.length, 0);
});
