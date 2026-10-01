/**
 * You.com Search Provider — closed-loop tests (no network, no real API calls).
 *
 * All HTTP is mocked by injecting a fetchImpl; the global fetch is never touched.
 *
 * Response shape follows the official You.com Web Search API:
 *   { results: { web: [ { url, title, description, snippets } ] } }
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { YouComSearchProvider } from '../discovery/you-com.provider';
import { ManualSeedProvider, normalizeUrl } from '../discovery/manual-seed.provider';
import { DiscoveryService } from '../discovery/discovery.service';
import { UrlSafetyService } from '../discovery/url-safety.service';
import type { DiscoveryProvider } from '../discovery/discovery-provider.types';

// Minimal ConfigService.get fake — no real env / no real key.
function fakeConfig(get: (k: string) => string | undefined) {
  return { get } as unknown as import('@nestjs/config').ConfigService;
}

function makeResponse(ok: boolean, status: number, json: unknown): Response {
  return { ok, status, json: async () => json } as unknown as Response;
}

function fetchReturns(payload: unknown, ok = true, status = 200) {
  return async () => makeResponse(ok, status, payload);
}

function fetchRejects() {
  return async () => {
    throw new Error('network down');
  };
}

// Official You.com Web Search `results.web` payload.
const WEB = [
  {
    url: 'https://shop.example.com/',
    title: 'Gear Shop',
    description: 'Outdoor gear.',
    snippets: ['Buy now', 'Free shipping'],
  },
  { url: 'http://www.example.org/about', title: 'About', description: 'A blog' },
  { url: 'not-a-url', title: 'bad' },
  { url: 'ftp://x.com', title: 'ftp link' },
];

test('valid results.web -> normalized candidates (url/domain/source/evidence)', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchReturns({ results: { web: WEB } }));
  const out = await p.discover({ query: 'outdoor gear', limit: 10 });

  // 2 valid http(s) urls; 'not-a-url' and 'ftp://' are skipped.
  assert.equal(out.length, 2);
  assert.equal(out[0].url, 'https://shop.example.com/');
  assert.equal(out[0].domain, 'shop.example.com');
  assert.equal(out[0].source, 'you-com');
  assert.match(out[0].evidence ?? '', /title: Gear Shop/);
  assert.match(out[0].evidence ?? '', /description: Outdoor gear\./);
  assert.match(out[0].evidence ?? '', /Buy now/);
  // www. stripped in domain
  assert.equal(out[1].domain, 'example.org');
  assert.ok(out[0].observedAt);
});

test('evidence mapping: title/description/snippets combined', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchReturns({ results: { web: [WEB[0]] } }));
  const out = await p.discover({ query: 'x' });
  assert.equal(out.length, 1);
  const ev = out[0].evidence ?? '';
  assert.match(ev, /title: Gear Shop/);
  assert.match(ev, /description: Outdoor gear\./);
  assert.match(ev, /Buy now/);
  assert.match(ev, /Free shipping/);
});

test('URL normalize: www strip and https scheme', async () => {
  const p = new YouComSearchProvider(
    fakeConfig(() => 'key'),
    fetchReturns({
      results: {
        web: [
          { url: 'http://www.example.org/about', title: 't', description: 'd' },
          { url: 'https://shop.example.com', title: 't', description: 'd' },
        ],
      },
    }),
  );
  const out = await p.discover({ query: 'x' });
  assert.equal(out.length, 2);
  assert.equal(out[0].url, 'http://www.example.org/about');
  assert.equal(out[0].domain, 'example.org');
  assert.equal(out[1].domain, 'shop.example.com');
});

test('empty results.web -> []', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchReturns({ results: { web: [] } }));
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('missing results key -> [] (fail-closed)', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchReturns({}));
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('malformed results (results is not an object) -> [] (fail-closed)', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchReturns({ results: [] }));
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('malformed structure (web is not an array) -> [] (fail-closed)', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchReturns({ results: { web: 'nope' } }));
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('missing YDC_API_KEY -> [] (fail-closed)', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => undefined), fetchReturns({ results: { web: WEB } }));
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('no query -> [] and search is never called', async () => {
  let called = false;
  const p = new YouComSearchProvider(
    fakeConfig(() => 'key'),
    async () => {
      called = true;
      return makeResponse(true, 200, { results: { web: [] } });
    },
  );
  const out = await p.discover({ urls: ['https://a.com'] }); // no query
  assert.deepEqual(out, []);
  assert.equal(called, false);
});

test('timeout / network error -> [] (fail-closed)', async () => {
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), fetchRejects());
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('non-2xx -> [] (fail-closed)', async () => {
  const p = new YouComSearchProvider(
    fakeConfig(() => 'key'),
    fetchReturns({ results: { web: [] } }, false, 500),
  );
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('malformed JSON -> [] (fail-closed)', async () => {
  const bad = {
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('bad json');
    },
  } as unknown as Response;
  const p = new YouComSearchProvider(fakeConfig(() => 'key'), async () => bad);
  const out = await p.discover({ query: 'x' });
  assert.deepEqual(out, []);
});

test('limit maps to count and is clamped to [1, 50]', async () => {
  let sent: any = null;
  const capture = async (_url: string, init: any) => {
    sent = JSON.parse(init.body);
    return makeResponse(true, 200, { results: { web: [] } });
  };

  const p1 = new YouComSearchProvider(fakeConfig(() => 'key'), capture);
  await p1.discover({ query: 'x', limit: 999 });
  assert.equal(sent.count, 50);

  const p2 = new YouComSearchProvider(fakeConfig(() => 'key'), capture);
  await p2.discover({ query: 'x', limit: 0 });
  assert.equal(sent.count, 1);
});

test('domain dedupe: same domain keeps first within one discovery call', async () => {
  const stub: DiscoveryProvider = {
    name: 'stub',
    async discover() {
      return [
        { url: 'https://a.com/1', domain: 'a.com', source: 'stub', observedAt: new Date().toISOString() },
        { url: 'https://a.com/2', domain: 'a.com', source: 'stub', observedAt: new Date().toISOString() },
        { url: 'https://b.com/', domain: 'b.com', source: 'stub', observedAt: new Date().toISOString() },
      ];
    },
  };
  const safety = new UrlSafetyService(async () => ['1.2.3.4']);
  const svc = new DiscoveryService([stub], safety);
  const out = await svc.discover({ query: 'x' });

  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((c) => c.domain),
    ['a.com', 'b.com'],
  );
});

test('ManualSeedProvider regression: seeds -> candidates, no network', async () => {
  const p = new ManualSeedProvider();
  const out = await p.discover({ urls: ['example.com', 'https://b.com/x'], limit: 5 });
  assert.equal(out.length, 2);
  assert.equal(out[0].url, 'https://example.com');
  assert.equal(out[0].domain, 'example.com');
  assert.equal(out[0].source, 'manual-seed');
  assert.equal(out[1].url, 'https://b.com/x');
  assert.equal(out[1].domain, 'b.com');
});

test('ManualSeedProvider regression: no urls -> []', async () => {
  const p = new ManualSeedProvider();
  const out = await p.discover({ query: 'ignored', limit: 5 });
  assert.deepEqual(out, []);
});

test('normalizeUrl helper: defaults to https', () => {
  assert.equal(normalizeUrl('http://x.com'), 'http://x.com');
  assert.equal(normalizeUrl('x.com'), 'https://x.com');
});
