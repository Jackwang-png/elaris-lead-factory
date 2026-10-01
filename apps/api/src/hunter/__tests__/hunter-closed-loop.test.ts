/**
 * Hunter Mainline V1 — closed-loop tests (DB-free, no network, no LLM).
 *
 * Covers:
 *  1  valid merchant
 *  2  SSRF private IP reject
 *  3  redirect re-check
 *  4  robots reject
 *  5  timeout / oversized response
 *  6  WooCommerce detection
 *  7  qualifyMerchant wiring
 *  8  Hunter assessment wiring
 *  9  Lead persistence
 *  10 external qualification must NOT override internal
 *  11 repeat discovery idempotency
 *  12 existing /api/v2/hunter/qualified compatibility
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HunterIntelligenceService } from '../hunter-intelligence.service';
import { HunterPersistenceService } from '../hunter-persistence.service';
import { HunterPipelineService } from '../hunter-pipeline.service';
import { DiscoveryService } from '../discovery/discovery.service';
import { ManualSeedProvider } from '../discovery/manual-seed.provider';
import { PageFetchService } from '../discovery/page-fetch.service';
import { UrlSafetyService } from '../discovery/url-safety.service';
import { HunterService } from '../../workforce/services/hunter.service';
import type { WorkforceContext } from '../../workforce/workforce.types';

const TENANT = 'tenant-1';

const WOO_HTML = `<html><head><title>Gear Shop</title>
<meta name="generator" content="WooCommerce 8.0">
</head><body class="woocommerce woocommerce-page">
<a href="/cart">Cart</a><a href="/checkout">Checkout</a>
<a href="/wp-json/wc/v3/products">API</a>
<div class="wc-product">Add to cart</div>
</body></html>`;

const PLAIN_HTML = `<html><head><title>Blog</title></head><body><p>hello</p></body></html>`;

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

// ---------------------------------------------------------------- fake fetch
type Responder = (url: string) => { status: number; body?: string; location?: string };

function makeFetch(responder: Responder): any {
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

function timeoutFetch(): any {
  return async () => {
    const err: any = new Error('timeout');
    err.name = 'TimeoutError';
    throw err;
  };
}

// ---------------------------------------------------------------- harness
function resolver(host: string): Promise<string[]> {
  const map: Record<string, string[]> = {
    'shop.example.com': ['93.184.216.34'],
    'plain.example.com': ['93.184.216.34'],
    'internal.local': ['10.0.0.5'],
    'loopback.test': ['127.0.0.1'],
  };
  return Promise.resolve(map[host] ?? ['93.184.216.34']);
}

function buildPipeline(prisma: FakePrisma, fetchImpl: any) {
  const safety = new UrlSafetyService(resolver);
  const fetcher = new PageFetchService(safety, fetchImpl);
  const discovery = new DiscoveryService([new ManualSeedProvider()], safety);
  const intelligence = new HunterIntelligenceService();
  const persistence = new HunterPersistenceService(prisma as any);
  const pipeline = new HunterPipelineService(discovery, fetcher, intelligence, persistence);
  return { safety, fetcher, discovery, intelligence, persistence, pipeline };
}

const ctx: WorkforceContext = {
  tenantId: TENANT,
  userId: 'user-1',
  traceId: 'trace-1',
} as any;

// ---------------------------------------------------------------- tests

test('6 + 7. WooCommerce detection and qualifyMerchant wiring', () => {
  const { intelligence } = buildPipeline(new FakePrisma(), makeFetch(() => ({ status: 404 })));
  const parsed = intelligence.parse(WOO_HTML);
  const detection = intelligence.detect(parsed);

  assert.equal(detection.isWooCommerce, true);
  assert.equal(detection.confidence, 'STRONG');
  assert.ok(detection.strongSignals.length >= 1);

  const q = intelligence.qualify({
    detection,
    signalCount: detection.strongSignals.length + detection.weakSignals.length,
    reachable: true,
    robotsAllowed: true,
    ssrfBlocked: false,
  });
  assert.equal(q.grade, 'A_STRONG');
  assert.equal(q.shouldEngage, true);
  assert.equal(q.isEcommerce, true);
});

test('7b. qualifyMerchant fail-closed on ssrf / robots / unreachable', () => {
  const { intelligence } = buildPipeline(new FakePrisma(), makeFetch(() => ({ status: 404 })));
  const none = intelligence.detect(intelligence.parse(PLAIN_HTML));

  assert.equal(
    intelligence.qualify({ detection: none, signalCount: 0, reachable: true, robotsAllowed: true, ssrfBlocked: true }).grade,
    'REJECTED',
  );
  assert.equal(
    intelligence.qualify({ detection: none, signalCount: 0, reachable: true, robotsAllowed: false, ssrfBlocked: false }).grade,
    'REJECTED',
  );
  assert.equal(
    intelligence.qualify({ detection: none, signalCount: 0, reachable: false, robotsAllowed: true, ssrfBlocked: false }).grade,
    'REJECTED',
  );
});

test('8. Hunter assessment wiring (readiness + recommendation present)', () => {
  const { intelligence } = buildPipeline(new FakePrisma(), makeFetch(() => ({ status: 404 })));
  const parsed = intelligence.parse(WOO_HTML);
  const q = intelligence.qualify({
    detection: intelligence.detect(parsed),
    signalCount: 3,
    reachable: true,
    robotsAllowed: true,
    ssrfBlocked: false,
  });
  const assessment = intelligence.assess({ url: 'https://shop.example.com/', parsed, qualification: q });
  assert.ok(assessment, 'assessment must be produced');
  assert.ok(Object.keys(assessment as object).length > 0);
});

test('1 + 9. valid merchant -> A_STRONG -> persisted', async () => {
  const prisma = new FakePrisma();
  const fetchImpl = makeFetch((url: string) => {
    if (url.endsWith('/robots.txt')) return { status: 404 };
    return { status: 200, body: WOO_HTML };
  });
  const { pipeline } = buildPipeline(prisma, fetchImpl);

  const results = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  assert.equal(results.length, 1);
  const r = results[0];

  assert.equal(r.qualification.grade, 'A_STRONG');
  assert.equal(r.reachable, true);
  assert.equal(r.ssrfBlocked, false);
  assert.ok(r.leadId, 'lead must be persisted');
  assert.ok(r.runId, 'analysis run must be persisted');

  // persistence mapping
  assert.equal(prisma.stores.company.length, 1);
  assert.equal(prisma.stores.intelligenceSignal.length, 1);
  assert.equal(prisma.stores.lead.length, 1);
  assert.equal(prisma.stores.leadAnalysisRun.length, 1);
  assert.equal(prisma.stores.leadIntelligence.length, 1);
  assert.ok(prisma.stores.leadSignal.length >= 1);
  assert.equal(prisma.stores.lead[0].qualifiedBy, 'elaris-v1.4');
});

test('2. SSRF private IP rejected', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(prisma, makeFetch(() => ({ status: 200, body: WOO_HTML })));

  const [r] = await pipeline.run(TENANT, { urls: ['http://internal.local/'] });
  assert.equal(r.ssrfBlocked, true);
  assert.equal(r.qualification.grade, 'REJECTED');
  assert.equal(r.reachable, false);
});

test('3. redirect is re-checked every hop (public -> private blocked)', async () => {
  const prisma = new FakePrisma();
  const fetchImpl = makeFetch((url: string) => {
    if (url.includes('internal.local')) return { status: 200, body: WOO_HTML };
    if (url.endsWith('/robots.txt')) return { status: 404 };
    return { status: 302, location: 'http://internal.local/' };
  });
  const { pipeline } = buildPipeline(prisma, fetchImpl);

  const [r] = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  assert.equal(r.reachable, false);
  assert.equal(r.qualification.grade, 'REJECTED');
  assert.ok(/private/i.test(r.blockedReason ?? ''), `expected private-address block, got: ${r.blockedReason}`);
});

test('4. robots disallow rejected', async () => {
  const prisma = new FakePrisma();
  const fetchImpl = makeFetch((url: string) => {
    if (url.endsWith('/robots.txt')) return { status: 200, body: 'User-agent: *\nDisallow: /\n' };
    return { status: 200, body: WOO_HTML };
  });
  const { pipeline } = buildPipeline(prisma, fetchImpl);

  const [r] = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  assert.equal(r.robotsAllowed, false);
  assert.equal(r.qualification.grade, 'REJECTED');
});

test('5a. all fetches failing -> robots pre-check fail-closed -> REJECTED', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(prisma, timeoutFetch());
  const [r] = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  // robots.txt cannot be verified -> fail-closed, page is never fetched
  assert.equal(r.robotsAllowed, false);
  assert.equal(r.reachable, false);
  assert.equal(r.qualification.grade, 'REJECTED');
});

test('5a2. page fetch timeout (robots ok) -> timedOut -> REJECTED', async () => {
  const prisma = new FakePrisma();
  const fetchImpl: any = async (url: string) => {
    if (url.endsWith('/robots.txt')) {
      return {
        status: 404,
        ok: false,
        headers: { get: () => null },
        text: async () => '',
        body: null,
      } as any;
    }
    const err: any = new Error('timeout');
    err.name = 'TimeoutError';
    throw err;
  };
  const { pipeline } = buildPipeline(prisma, fetchImpl);
  const [r] = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  assert.equal(r.robotsAllowed, true);
  assert.equal(r.timedOut, true);
  assert.equal(r.reachable, false);
  assert.equal(r.qualification.grade, 'REJECTED');
});

test('5b. oversized response -> tooLarge -> REJECTED', async () => {
  const prisma = new FakePrisma();
  const big = 'x'.repeat(1024 * 1024); // 1MB > default 512KB cap
  const { pipeline } = buildPipeline(
    prisma,
    makeFetch((url: string) => (url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: big })),
  );
  const [r] = await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  assert.equal(r.tooLarge, true);
  assert.equal(r.reachable, false);
  assert.equal(r.qualification.grade, 'REJECTED');
});

test('11. repeat discovery is idempotent', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(
    prisma,
    makeFetch((url: string) => (url.endsWith('/robots.txt') ? { status: 404 } : { status: 200, body: WOO_HTML })),
  );

  await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });
  await pipeline.run(TENANT, { urls: ['https://shop.example.com/'] });

  assert.equal(prisma.stores.company.length, 1, 'company must not duplicate');
  assert.equal(prisma.stores.intelligenceSignal.length, 1, 'signal must not duplicate (evidenceHash)');
  assert.equal(prisma.stores.lead.length, 1, 'lead must not duplicate');
  assert.equal(prisma.stores.leadAnalysisRun.length, 1, 'run must not duplicate (idempotencyKey)');
  assert.equal(prisma.stores.leadIntelligence.length, 1, 'intelligence must be replaced, not duplicated');
});

// ---------------------------------------------------------------- /qualified
function buildHunterService(prisma: FakePrisma, pipeline: HunterPipelineService) {
  const audit = { log: async () => undefined } as any;
  const compliance = { check: () => ({ status: 'ok', reason: null, checks: [] }) } as any;
  const humanControl = {
    decide: () => ({ decision: { level: 'LOW', reason: 'auto' }, approvalRequired: false, autoApproved: true }),
  } as any;
  const approval = { request: async () => ({ approvalId: 'apr-1' }) } as any;
  return new HunterService(prisma as any, audit, compliance, humanControl, approval, pipeline);
}

test('10. external qualification A_STRONG must NOT override internal REJECTED', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(prisma, makeFetch(() => ({ status: 404 })));
  const service = buildHunterService(prisma, pipeline);

  const lead = await prisma.lead.create({
    data: { tenantId: TENANT, name: 'Seed Lead', source: 'hunter', status: 'new' },
  });

  await service.qualified(
    TENANT,
    {
      leadId: lead.id,
      // caller tries to force a strong grade
      qualification: { grade: 'A_STRONG', score: 95, summary: 'caller says strong' },
    } as any,
    ctx,
    false,
  );

  const message = prisma.stores.message[0];
  assert.ok(message, 'handoff context message must be created');
  const meta = message.metadata;

  // FINAL judgement is internal (no internal evidence -> fail-closed REJECTED)
  assert.equal(meta.qualification.grade, 'REJECTED');
  assert.notEqual(meta.qualification.grade, 'A_STRONG');

  // external input retained ONLY as metadata
  assert.equal(meta.externalQualification.grade, 'A_STRONG');
  assert.equal(meta.externalQualification.qualifiedBy, 'external');
  assert.equal(meta.externalQualification.confidence, 'LOW');
  assert.equal(meta.externalQualification.authoritative, false);
  assert.equal(meta.externalQualification.ignoredForJudgement, true);

  // no LeadIntelligence was created from the external value
  assert.equal(prisma.stores.leadIntelligence.length, 0);
});

test('12. /qualified remains compatible when no external qualification is sent', async () => {
  const prisma = new FakePrisma();
  const { pipeline } = buildPipeline(prisma, makeFetch(() => ({ status: 404 })));
  const service = buildHunterService(prisma, pipeline);

  const lead = await prisma.lead.create({
    data: { tenantId: TENANT, name: 'Plain Lead', source: 'hunter', status: 'new' },
  });

  const res: any = await service.qualified(TENANT, { leadId: lead.id } as any, ctx, false);

  assert.equal(res.approved, true);
  assert.ok(res.conversation, 'conversation created (Hunter -> Support handoff)');
  assert.equal(prisma.stores.message.length, 1);
  assert.equal(prisma.stores.message[0].metadata.externalQualification, null);
  assert.equal(prisma.stores.message[0].metadata.qualification.grade, 'REJECTED');
});
