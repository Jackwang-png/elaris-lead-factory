/**
 * MaPay (码支付) adapter tests — signature rule + provider behaviour.
 *
 * Signature is validated against the OFFICIAL PHP example from the platform
 * docs. Provider network calls are mocked (no real orders are created).
 *
 * Run: npx ts-node src/payment/providers/aggregate/mapay.test.ts
 * (excluded from nest build via tsconfig exclude of *.test.ts)
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { signParams, verifySign, buildSignString } from './mapay.signature';
import { AggregatePaymentProvider } from './aggregate-payment.provider';
import { PaymentError, PaymentErrorCode } from '../../domain/payment.errors';

const KEY = 'ZVowUMfuMead8r8m779y'; // test-only; real key lives in .env

/* ------------------------------------------------------------------ */
/* Signature rule (official PHP example from docs)                     */
/* ------------------------------------------------------------------ */

test('MaPay sign: matches official PHP example', () => {
  // From https://mzf.mapay.cc/doc epay_md5 example
  const params = {
    pid: '1000',
    type: 'alipay',
    out_trade_no: '20240101123456',
    notify_url: 'http://www.example.com/notify_url.php',
    return_url: 'http://www.example.com/return_url.php',
    name: '测试商品',
    money: '100.00',
  };
  const key = 'your_key_here';

  // Re-implement the official algorithm independently to cross-check.
  const stringA = Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const expected = createHash('md5').update(stringA + key).digest('hex');

  const actual = signParams(params, key);
  assert.equal(actual, expected);
  assert.equal(actual.length, 32);
  assert.equal(actual, actual.toLowerCase());
});

test('MaPay sign: excludes sign/sign_type and empty values', () => {
  const params = {
    pid: '12733',
    money: '99.00',
    out_trade_no: 'o123',
    sign: 'should-be-excluded',
    sign_type: 'MD5',
    empty: '',
    keep: '1',
  };
  const s = buildSignString(params, KEY);
  assert.ok(!s.includes('sign='), 'sign must be excluded');
  assert.ok(!s.includes('sign_type='), 'sign_type must be excluded');
  assert.ok(!s.includes('empty='), 'empty values must be excluded');
  assert.ok(s.includes('pid=12733'));
  assert.ok(s.includes('keep=1'));
  // sorted ascending
  const keys = s.split('&').map((p) => p.split('=')[0]);
  assert.deepEqual(keys, [...keys].sort());
});

test('MaPay verifySign: valid sign passes, tampered fails', () => {
  const params = {
    pid: '12733',
    out_trade_no: 'order_1',
    trade_no: 'T20260808',
    money: '299.00',
    trade_status: 'TRADE_SUCCESS',
    type: 'alipay',
  };
  const sign = signParams(params, KEY);
  assert.equal(verifySign({ ...params }, KEY, sign), true);
  // wrong provided sign → false
  assert.equal(verifySign({ ...params }, KEY, 'deadbeef'), false);
  // tampered amount → recomputed sign differs from provided sign
  assert.equal(verifySign({ ...params, money: '999.00' }, KEY, sign), false);
  assert.equal(verifySign(params, KEY, undefined), false);
});

/* ------------------------------------------------------------------ */
/* Provider — mocked HTTP                                              */
/* ------------------------------------------------------------------ */

const BASE = 'https://mzf.mapay.cc/xpay/epay';

function makeProvider(overrides: Record<string, unknown> = {}) {
  return new AggregatePaymentProvider({
    provider: 'aggregate',
    environment: 'sandbox',
    enabled: true,
    merchantId: '12733',
    apiKey: KEY,
    gatewayUrl: BASE,
    payType: 'alipay',
    notifyUrl: 'https://smartcs.example/api/payment/notify',
    ...overrides,
  });
}

test('MaPay createOrder: builds signed request and follows cashier redirect', async () => {
  const provider = makeProvider();
  let capturedUrl = '';
  let capturedBody = '';

  mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedBody = String(init?.body ?? '');
    return new Response('Found', {
      status: 302,
      headers: { location: '/pay/T888' },
    });
  });

  const result = await provider.createOrder({
    orderId: 'order_1',
    tenantId: 't1',
    plan: 'PRO',
    amount: 9900, // minor units = 99.00 yuan
    currency: 'CNY',
  });

  assert.equal(capturedUrl, `${BASE}/submit.php`);
  assert.ok(capturedBody.includes('pid=12733'));
  assert.ok(capturedBody.includes('money=99.00'), 'minor→yuan conversion');
  assert.ok(capturedBody.includes('out_trade_no=order_1'));
  assert.ok(capturedBody.includes('sign='));
  assert.ok(capturedBody.includes('sign_type=MD5'));

  assert.equal(result.orderId, 'order_1');
  assert.equal(result.providerOrderId, 'order_1');
  assert.equal(result.paymentUrl, 'https://mzf.mapay.cc/pay/T888'); // absolute cashier URL
  assert.equal(result.amount, 9900);
  assert.equal(result.currency, 'CNY');
});

test('MaPay createOrder: JSON error body → PaymentError PROVIDER_ERROR', async () => {
  const provider = makeProvider();
  mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ code: -1, msg: '商户不存在' }), { status: 200, headers: { location: '' } }),
  );
  await assert.rejects(
    provider.createOrder({
      orderId: 'order_x', tenantId: 't1', plan: 'PRO', amount: 100, currency: 'CNY',
    }),
    (e: unknown) => e instanceof PaymentError && e.code === PaymentErrorCode.PROVIDER_ERROR,
  );
});

test('MaPay queryOrder: maps status 1 → PAID', async () => {
  const provider = makeProvider();
  mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('act=order'));
    assert.ok(url.includes('pid=12733'));
    assert.ok(url.includes('out_trade_no=order_1'));
    return new Response(JSON.stringify({
      code: 1, msg: 'ok', trade_no: 'T888', out_trade_no: 'order_1',
      status: 1, money: '99.00',
    }), { status: 200 });
  });
  const result = await provider.queryOrder({ orderId: 'order_1' });
  assert.equal(result.status, 'PAID');
  assert.equal(result.providerOrderId, 'T888');
});

test('MaPay queryOrder: status 0 → PENDING', async () => {
  const provider = makeProvider();
  mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ code: 1, msg: 'ok', status: 0 }), { status: 200 }),
  );
  const result = await provider.queryOrder({ orderId: 'order_1' });
  assert.equal(result.status, 'PENDING');
});

test('MaPay webhook: verify → parse → normalize TRADE_SUCCESS', async () => {
  const provider = makeProvider();
  const params: Record<string, string> = {
    pid: '12733',
    trade_no: 'T202608081200',
    out_trade_no: 'order_1',
    type: 'alipay',
    name: 'PRO',
    money: '299.00',
    trade_status: 'TRADE_SUCCESS',
  };
  params.sign = signParams(params, KEY);
  params.sign_type = 'MD5';

  const body = Buffer.from(new URLSearchParams(params).toString());

  const verification = await provider.verifyWebhook(body, {});
  assert.equal(verification.valid, true);

  const event = await provider.normalize(body, {});
  assert.equal(event.provider, 'aggregate');
  assert.equal(event.eventType, 'PAYMENT_SUCCEEDED');
  assert.equal(event.orderId, 'order_1');
  assert.equal(event.providerOrderId, 'T202608081200');
  assert.equal(event.amount, 29900); // 299.00 yuan → minor units
});

test('MaPay webhook: bad sign → verification invalid', async () => {
  const provider = makeProvider();
  const body = Buffer.from(
    'pid=12733&trade_no=T1&out_trade_no=order_1&money=1.00&trade_status=TRADE_SUCCESS&sign=deadbeef',
  );
  const verification = await provider.verifyWebhook(body, {});
  assert.equal(verification.valid, false);
});

test('MaPay closeOrder/refund: not supported → BUSINESS_ERROR', async () => {
  const provider = makeProvider();
  await assert.rejects(
    provider.closeOrder({ orderId: 'x' }),
    (e: unknown) => e instanceof PaymentError && e.code === PaymentErrorCode.BUSINESS_ERROR,
  );
  await assert.rejects(
    provider.refund({ orderId: 'x', refundId: 'r', amount: 100, currency: 'CNY' }),
    (e: unknown) => e instanceof PaymentError && e.code === PaymentErrorCode.BUSINESS_ERROR,
  );
});
