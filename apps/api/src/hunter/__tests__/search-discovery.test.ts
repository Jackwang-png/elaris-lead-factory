/**
 * Hunter Search Discovery V1 — tests (DB-free, zero network, zero LLM).
 *
 * Exercises the SearchProvider adapter + DiscoveryService dedup + the full
 * Hunter pipeline (URL safety -> qualification -> assessment -> persistence),
 * proving the search path is wired without touching the business kernel.
 *
 * Covers:
 *   1  query -> candidates
 *   2  query + industry + region + country
 *   3  candidate dedupe (by domain, keep fuller evidence)
 *   4  invalid URL rejected (via ManualSeed path through safety)
 *   5  private IP rejected
 *   6  redirect re-check (public -> private blocked)
 *   7  robots disallow rejected
 *   8  provider unavailable -> fail-closed
 *   9  tenant isolation
 *   10 discovery evidence persisted (source + snippet)
 *   11 duplicate discovery idempotency
 *   12 search result limit respected
 *   13 ManualSeedProvider compatibility (search not required)
 *   14 Hunter Mainline compatibility (qualification/assessment still produced)
 *   15 external qualification cannot override internal
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HunterIntelligenceService } from '../hunter-intelligence.service';
import { HunterPersistenceService } from '../hunter-persistence.service';
import { HunterPipelineService } from '../hunter-pipeline.service';
import { DiscoveryService, dedupeCandidates } from '../discovery/discovery.service';
import { ManualSeedProvider } from '../discovery/manual-seed.provider';
import { SearchProvider, SearchProviderUnavailableError } from '../discovery/search.provider';
import { SearchProviderConfig } from '../discovery/search-provider.config';
import { PageFetchService } from '../discovery/page-fetch.service';
import { UrlSafetyService } from '../discovery/url-safety.service';

const TENANT = 'tenant-1';

const WOO_HTML = `<html><head><title>Gear Shop</title>
<meta name="generator" content="WooCommerce 8.0">
</head><body class="woocommerce woocommerce-page">
<a href="/cart">Cart</a><a href="/checkout">Checkout</a>
<a href="/wp-json/wc/v3/products">API</a>
<div class="wc-product">Add to cart</div>
</body></html>`;

// ---------------------------------------------------------------- fake prisma
class FakePrisma {
  stores: Record<string, any[]> = {};
  private seq = 0;

  private rows(name: string): any[] {
    if (!this.stores[name]) this.stores[name] = [];
    return this.stores[name];
  }

  private matches(row: any, where: any): boolean {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (row[k] !== v) return false;
    }
    return true;
  }

  private model(name: string) {
    const self = this;
    return {
      async findFirst({ where }: any = {}) {
        return self.rows(name).find((r) => self.matches(r, where)) ?? null;
      },
      async create({ data }: any) {
        self.seq += 1;
        const row = { id: `${name}-${self.seq}`, ...data };
        self.rows(name).push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = self.rows(name).find((r) => r.id === where.id);
        if (!row) throw new Error(`${name} not found: ${where.id}`);
        Object.assign(row, data);
        return row;
      },
      async count({ where }: any = {}) {
        return self.rows(name).filter((r) => self.matches(r, where)).length;
      },
    };
  }

  get company() { return this.model('company'); }
  get intelligenceSignal() { return this.model('intelligenceSignal'); }
  get lead() { return this.model('lead'); }
  get leadAnalysisRun() { return this.model('leadAnalysisRun'); }
  get leadIntelligence() { return this.model('leadIntelligence'); }
  get leadSignal() { return this.model('leadSignal'); }
  get customer() { return this.model('customer'); }
  get conversation() { return this.model('conversation'); }
  get message() { return this.model('message'); }
}

// ---------------------------------------------------------------- fake page fetch
type PageResponder = (url: string) => { status: number; body?: string; location?: string };

function makeFetch(responder: PageResponder): any {
  return async (url: string) => {
    const r = responder(url);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      headers: { get: (k: string) => (k.toLowerCase() === 'location' ? r.location ?? null : null) },
      text: async () => r.body ?? '',
      body: null,
    } as any;
  };
}

// ---------------------------------------------------------------- fake search fetch
type SearchResponder = (input: string, init: any) => { status: number; json: any };

function makeSearchFetch(responder: SearchResponder): any {
  return async (input: string, init: any) => {
    const r = responder(input, init);
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      json: async () => r.json,
    } as any;
  };
}

function timeoutFetch(): any {
  return async () => {
    const err: any = new Error('timeout');
    err.name = 'TimeoutError';
    throw err;
  };
}

// ---------------------------------------------------------------- resolver
function resolver(host: string): Promise<string[]> {
  const map: Record<string, string[]> = {
    'shop1.example.com': ['93.184.216.34'],
    'shop2.example.com': ['93.184.216.34'],
    'shop3.example.com': ['93.184.216.34'],
    'shop.example.com': ['93.184.216.34'],
    'plain.example.com': ['93.184.216.34'],
    'internal.local': ['10.0.0.5'],
    'loopback.test': ['127.0.0.1'],
  };
  return Promise.resolve(map[host] ?? ['93.184.216.34']);
}

function serperConfig(apiKey = 'test-key'): SearchProviderConfig {
  return new SearchProviderConfig(
    apiKey,
    'https://search.test/search',
    'serper',
    5000,
  );
}

function buildPipeline(
  prisma: FakePrisma,
  pageFetchImpl: any,
  searchFetchImpl?: any,
) {
  const safety = new UrlSafetyService(resolver);
  const fetcher = new PageFetchService(safety, pageFetchImpl);
  const search = new SearchProvider(serperConfig(), searchFetchImpl);
  const discovery = new DiscoveryService([new ManualSeedProvider(), search], safety);
  const intelligence = new HunterIntelligenceService();
  const persistence = new HunterPersistenceService(prisma as any);
  const pipeline = new HunterPipelineService(discovery, fetcher, intelligence, persistence);
  return { safety, fetcher, discovery, search, intelligence, persistence, pipeline };
}

const okSearch = (organic: any[]) =>
  makeSearchFetch(() => ({ status: 200, json: { organic } }));

// ================================================================ 1. query -> candidates
test('1. query -> candidates from SearchProvider', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  const search = okSearch([
    { title: 'Shop One', link: 'https://shop1.example.com/', snippet: 'gear' },
    { title: 'Shop Two', link: 'https://shop2.example.com/', snippet: 'gear' },
    { title: 'Shop Three', link: 'https://shop3.example.com/', snippet: 'gear' },
  ]);
  const { pipeline } = buildPipeline(prisma, page, search);

  const results = await pipeline.run(TENANT, { query: 'woocommerce outdoor gear' });
  assert.equal(results.length, 3);
  assert.ok(results.every((r) => r.source === 'serper'));
  assert.equal(prisma.stores.company.length, 3);
});

// ================================================================ 2. query + filters
test('2. query + industry + region + country compose the search query', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch(() => ({ status: 404 }));
  let capturedQ = '';
  const search = makeSearchFetch((_input, init) => {
    capturedQ = JSON.parse(init.body).q;
    return {
      status: 200,
      json: { organic: [{ title: 'Shop', link: 'https://shop1.example.com/', snippet: 'x' }] },
    };
  });
  const { pipeline } = buildPipeline(prisma, page, search);

  const results = await pipeline.run(TENANT, {
    query: 'woocommerce',
    industry: 'outdoor',
    region: 'Bavaria',
    country: 'DE',
  });
  assert.ok(capturedQ.includes('woocommerce'));
  assert.ok(capturedQ.includes('outdoor'));
  assert.ok(capturedQ.includes('Bavaria'));
  assert.ok(capturedQ.includes('DE'));
  assert.equal(results.length, 1);
});

// ================================================================ 3. dedupe
test('3. candidate dedupe merges by domain, keeps fuller evidence', () => {
  const out = dedupeCandidates([
    { url: 'https://a.com/x', domain: 'a.com', source: 'serper', observedAt: 't', evidence: 'short' },
    {
      url: 'https://a.com/y',
      domain: 'a.com',
      source: 'serper',
      observedAt: 't',
      evidence: 'longer evidence fragment here',
    },
    { url: 'https://b.com', domain: 'b.com', source: 'serper', observedAt: 't' },
  ]);
  assert.equal(out.length, 2);
  const a = out.find((c) => c.domain === 'a.com')!;
  assert.equal(a.evidence, 'longer evidence fragment here');
  assert.ok(out.some((c) => c.domain === 'b.com'));
});

// ================================================================ 4. invalid URL reject
test('4. invalid URL rejected by URL safety', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(prisma, makeFetch(() => ({ status: 404 })));
  const [r] = await pipeline.run(TENANT, { urls: ['http://not a valid url'] });
  assert.equal(r.ssrfBlocked, true);
  assert.equal(r.qualification.grade, 'REJECTED');
});

// ================================================================ 5. private IP reject
test('5. private IP rejected (via search candidate)', async () => {
  const prisma = new FakePrisma();
  const search = okSearch([{ title: 'Internal', link: 'http://10.0.0.5/', snippet: 'x' }]);
  const { pipeline } = buildPipeline(prisma, makeFetch(() => ({ status: 404 })), search);
  const [r] = await pipeline.run(TENANT, { query: 'anything' });
  assert.equal(r.ssrfBlocked, true);
  assert.equal(r.qualification.grade, 'REJECTED');
  assert.ok(/private/i.test(r.blockedReason ?? ''));
});

// ================================================================ 6. redirect re-check
test('6. redirect re-checked every hop (public -> private blocked)', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) => {
    if (url.includes('internal.local')) return { status: 200, body: WOO_HTML };
    if (url.endsWith('/robots.txt')) return { status: 404 };
    return { status: 302, location: 'http://internal.local/' };
  });
  const search = okSearch([{ title: 'Shop', link: 'https://shop.example.com/', snippet: 'x' }]);
  const { pipeline } = buildPipeline(prisma, page, search);

  const [r] = await pipeline.run(TENANT, { query: 'woocommerce' });
  assert.equal(r.reachable, false);
  assert.equal(r.qualification.grade, 'REJECTED');
  assert.ok(/private/i.test(r.blockedReason ?? ''));
});

// ================================================================ 7. robots disallow
test('7. robots disallow rejected', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) => {
    if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /\n' };
    return { status: 200, body: WOO_HTML };
  });
  const search = okSearch([{ title: 'Shop', link: 'https://shop.example.com/', snippet: 'x' }]);
  const { pipeline } = buildPipeline(prisma, page, search);

  const [r] = await pipeline.run(TENANT, { query: 'woocommerce' });
  assert.equal(r.robotsAllowed, false);
  assert.equal(r.qualification.grade, 'REJECTED');
});

// ================================================================ 8. provider unavailable -> fail-closed
test('8a. SearchProvider without API key throws (fail-closed)', async () => {
  const provider = new SearchProvider(serperConfig(undefined));
  await assert.rejects(
    () => provider.discover({ query: 'x' }),
    (e: any) => e instanceof SearchProviderUnavailableError,
  );
});

test('8b. SearchProvider upstream failure throws (fail-closed)', async () => {
  const provider = new SearchProvider(serperConfig(), timeoutFetch());
  await assert.rejects(
    () => provider.discover({ query: 'x' }),
    (e: any) => e instanceof SearchProviderUnavailableError,
  );
});

test('8c. discovery with unconfigured search fails closed (no silent empty)', async () => {
  const prisma = new FakePrisma();
  const safety = new UrlSafetyService(resolver);
  const search = new SearchProvider(serperConfig(undefined)); // no key
  const discovery = new DiscoveryService([new ManualSeedProvider(), search], safety);
  const intelligence = new HunterIntelligenceService();
  const persistence = new HunterPersistenceService(prisma as any);
  const pipeline = new HunterPipelineService(
    discovery,
    new PageFetchService(safety, makeFetch(() => ({ status: 404 }))),
    intelligence,
    persistence,
  );
  await assert.rejects(
    () => pipeline.run(TENANT, { query: 'woocommerce' }),
    (e: any) => e instanceof SearchProviderUnavailableError,
  );
});

// ================================================================ 9. tenant isolation
test('9. tenant isolation — records scoped per tenantId', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  const search = okSearch([{ title: 'Shop', link: 'https://shop1.example.com/', snippet: 'x' }]);
  const { pipeline } = buildPipeline(prisma, page, search);

  await pipeline.run(TENANT, { query: 'woocommerce' });
  await pipeline.run('tenant-2', { query: 'woocommerce' });

  assert.equal(prisma.stores.company.length, 2);
  assert.equal(prisma.stores.lead.length, 2);
  assert.ok(prisma.stores.company.every((c) => c.tenantId === TENANT || c.tenantId === 'tenant-2'));
  assert.equal(
    prisma.stores.company.filter((c) => c.tenantId === TENANT).length,
    1,
  );
});

// ================================================================ 10. evidence persistence
test('10. discovery evidence persisted (source + snippet)', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  const search = okSearch([
    { title: 'Gear Shop', link: 'https://shop1.example.com/', snippet: 'We sell outdoor gear' },
  ]);
  const { pipeline } = buildPipeline(prisma, page, search);

  await pipeline.run(TENANT, { query: 'woocommerce' });
  const signal = prisma.stores.intelligenceSignal[0];
  assert.ok(signal.evidence.includes('source=serper'));
  assert.ok(signal.evidence.includes('discovery=Gear Shop — We sell outdoor gear'));
  assert.equal(signal.sourceSystem, 'hunter');
});

// ================================================================ 11. idempotency
test('11. duplicate discovery is idempotent', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  const search = okSearch([{ title: 'Shop', link: 'https://shop1.example.com/', snippet: 'x' }]);
  const { pipeline } = buildPipeline(prisma, page, search);

  await pipeline.run(TENANT, { query: 'woocommerce' });
  await pipeline.run(TENANT, { query: 'woocommerce' });

  assert.equal(prisma.stores.company.length, 1);
  assert.equal(prisma.stores.intelligenceSignal.length, 1);
  assert.equal(prisma.stores.lead.length, 1);
  assert.equal(prisma.stores.leadAnalysisRun.length, 1);
  assert.equal(prisma.stores.leadIntelligence.length, 1);
});

// ================================================================ 12. result limit
test('12. search result limit respected', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  const search = okSearch([
    { title: 'A', link: 'https://shop1.example.com/', snippet: 'x' },
    { title: 'B', link: 'https://shop2.example.com/', snippet: 'x' },
    { title: 'C', link: 'https://shop3.example.com/', snippet: 'x' },
    { title: 'D', link: 'https://shop4.example.com/', snippet: 'x' },
    { title: 'E', link: 'https://shop5.example.com/', snippet: 'x' },
  ]);
  const { pipeline } = buildPipeline(prisma, page, search);

  const results = await pipeline.run(TENANT, { query: 'woocommerce', limit: 2 });
  assert.equal(results.length, 2);
  assert.equal(prisma.stores.company.length, 2);
});

// ================================================================ 13. ManualSeed compatibility
test('13. ManualSeedProvider still works when only URLs supplied (search idle)', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  // No query -> SearchProvider short-circuits (no wasted API call, fail-closed).
  const search = makeSearchFetch(() => ({ status: 200, json: { organic: [] } }));
  const { pipeline } = buildPipeline(prisma, page, search);

  const results = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  assert.equal(results.length, 1);
  assert.equal(results[0].source, 'manual-seed');
  assert.equal(prisma.stores.lead.length, 1); // manual discovery persisted normally
});

// ================================================================ 14. Hunter Mainline compatibility
test('14. search candidate still produces qualification + assessment', async () => {
  const prisma = new FakePrisma();
  const page = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML },
  );
  const search = okSearch([{ title: 'Gear Shop', link: 'https://shop1.example.com/', snippet: 'x' }]);
  const { pipeline } = buildPipeline(prisma, page, search);

  const [r] = await pipeline.run(TENANT, { query: 'woocommerce outdoor gear' });
  assert.equal(r.qualification.grade, 'A_STRONG');
  assert.ok(r.assessment, 'Hunter assessment must be produced');
  assert.ok(r.leadId, 'lead must be persisted');
});

// ================================================================ 15. external qualification cannot override internal
test('15. internal qualification is the only source (no external override)', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(prisma, makeFetch(() => ({ status: 404 })));

  // Unknown lead -> fail-closed qualification, never an externally-injected grade.
  const internal = await pipeline.internalQualificationForLead(TENANT, 'does-not-exist');
  assert.equal(internal.source, 'fail-closed');
  assert.equal(internal.qualification.grade, 'REJECTED');

  // A plain (non-ecommerce) search candidate is graded by the internal brain,
  // proving the pipeline never consults an external/ caller-supplied grade.
  const search = okSearch([{ title: 'Blog', link: 'https://plain.example.com/', snippet: 'x' }]);
  const plainPage = makeFetch((url: string) =>
    url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: '<html><body>hi</body></html>' },
  );
  const built = buildPipeline(new FakePrisma(), plainPage, search);
  const [r] = await built.pipeline.run(TENANT, { query: 'blog' });
  assert.notEqual(r.qualification.grade, 'A_STRONG');
  assert.equal(r.qualification.isEcommerce, false);
});
