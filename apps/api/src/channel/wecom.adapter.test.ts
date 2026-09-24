/**
 * 企业微信（WeCom）渠道适配器测试 —— 凭证缺失降级 / 消息解析 / 验签宽松。
 *
 * 说明：沿用仓库测试风格（node:test + ts-node，run-all-tests.js 自动收集）。
 *
 * Run: npx ts-node src/channel/wecom.adapter.test.ts
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';

import { WecomAdapter } from './wecom.adapter';

function makeAdapter(env: Record<string, string>): WecomAdapter {
  const config = new ConfigService(env);
  return new WecomAdapter(config as any);
}

test('wecom: 凭证缺失时 sendMessage 降级不抛错（warn 日志）', async () => {
  const adapter = makeAdapter({});
  await assert.doesNotReject(() => adapter.sendMessage('user1', '你好'));
});

test('wecom: 凭证缺失时 getCustomer/syncCustomer 返回占位数据', async () => {
  const adapter = makeAdapter({});
  const c = await adapter.getCustomer('u1');
  assert.equal(c.id, 'u1');
  const s = await adapter.syncCustomer('u1', 't1');
  assert.equal(s.channel, 'wecom');
});

test('wecom: verifyWebhook 宽松返回 true（未接入回调验签）', () => {
  const adapter = makeAdapter({});
  assert.equal(adapter.verifyWebhook({ whatever: 1 }), true);
});

test('wecom: processMessage 解析文本消息为 ChannelMessage', async () => {
  const adapter = makeAdapter({});
  const msg = await adapter.processMessage(
    { msgid: 'm1', from: 'zhangsan', text: { content: '在吗' } },
    'b1',
    't1',
  );
  assert.equal(msg?.id, 'm1');
  assert.equal(msg?.content, '在吗');
  assert.equal(msg?.sender, 'zhangsan');
  assert.equal(msg?.platformId, 'zhangsan');
});

test('wecom: 凭证齐全时 sendMessage 真实调用企业微信 API（fetch mock）', async () => {
  const calls: Array<{ url: string; init?: any }> = [];
  mock.method(globalThis, 'fetch', async (url: string, init?: any) => {
    calls.push({ url, init });
    const u = String(url);
    if (u.includes('/gettoken')) {
      return new Response(JSON.stringify({ errcode: 0, access_token: 'TOKEN_ABC', expires_in: 7200 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // message/send
    return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  try {
    const adapter = makeAdapter({
      WECOM_CORP_ID: 'corp1',
      WECOM_AGENT_ID: '1000002',
      WECOM_SECRET: 'sec1',
    });
    await adapter.sendMessage('zhangsan', '测试消息');
    // token 缓存：第二次调用不应再请求 gettoken
    await adapter.sendMessage('lisi', '第二条');

    assert.equal(calls.length, 3, '应为 1 次 gettoken + 2 次 send（token 缓存复用）');
    const sendCalls = calls.filter((c) => c.url.includes('/message/send'));
    assert.equal(sendCalls.length, 2);
    for (const c of sendCalls) {
      assert.ok(c.url.includes('access_token=TOKEN_ABC'), 'send 必须带缓存 token');
      const body = JSON.parse(c.init?.body ?? '{}');
      assert.equal(body.msgtype, 'text');
      assert.equal(body.agentid, 1000002);
      assert.equal(body.touser, c.init?.body?.includes?.('zhangsan') ? 'zhangsan' : 'lisi');
      assert.equal(body.text.content, c.init?.body?.includes?.('测试消息') ? '测试消息' : '第二条');
    }
  } finally {
    mock.restoreAll();
  }
});
