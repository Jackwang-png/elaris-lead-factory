/**
 * HUNTER Intelligence V1.4 — 测试（纯离线，零网络、零 DB）。
 *
 * 运行：node --import ts-node/register --test src/elaris/elaris.hunter.test.ts
 * 覆盖：高/中/无购买信号、明确 pain、推断 pain、证据缺失、数据不足、
 *       LLM 不可用、LLM 越界、推荐不可生成、fail-closed 兜底，以及证据不可编造不变量。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyFreshness, extractBuyingSignals, findKeywordHits, matchesAnyKeyword, tierForBuyingScore } from './buying-signals';
import { HUNTER_READINESS } from './hunter.constants';
import { extractPainSignals } from './pain-signals';
import { computeSalesReadiness } from './sales-readiness';
import { buildSalesRecommendation, buildSalesRecommendationRules } from './sales-recommendation';
import { buildHunterAssessment } from './hunter.assessment';
import type { ElarisGrade } from './elaris.constants';
import type { MerchantQualification } from './qualification';
import type { BuyingSignalsResult, PainSignalsResult } from './hunter.types';

/* ------------------------------- fixtures ------------------------------- */

const HOT_TEXT = [
  'Products: Add to Cart | Checkout | Buy now',
  'Wholesale programme: become a distributor or reseller (OEM / ODM available).',
  'Request a quote for bulk order pricing.',
  'Limited time offer with free shipping and delivery tracking.',
  'Contact us on WhatsApp, or sign in to My Account for order tracking.',
  'Sorry, some items are out of stock this week.',
].join(' ');

const MEDIUM_TEXT = 'Our products are on sale. Request a quote for pricing. Contact us for shipping and delivery.';

const PLAIN_TEXT = 'Welcome to Acme. We are a friendly team based in Berlin and we like baking bread.';

const PAIN_TEXT = 'This item is out of stock. We also hit a gateway error during checkout last night.';

const MANUAL_ORDER_TEXT = 'To buy our products, call to order or order via whatsapp during business hours.';

const URL = 'https://acme.example/';

function qualification(grade: ElarisGrade, reasons: string[] = []): MerchantQualification {
  return {
    grade,
    score: grade === 'A_STRONG' ? 90 : grade === 'B_POTENTIAL' ? 60 : grade === 'C_WEAK' ? 30 : 0,
    isEcommerce: grade !== 'REJECTED',
    shouldEngage: grade === 'A_STRONG' || grade === 'B_POTENTIAL',
    reasons,
    observedSignals: [],
    recommendedAction: '',
  };
}

function buyingFor(text: string): BuyingSignalsResult {
  return extractBuyingSignals({ url: URL, text, observedAt: '2026-09-25T00:00:00Z', referenceTime: '2026-09-27T00:00:00Z' });
}

function painFor(text: string): PainSignalsResult {
  return extractPainSignals({ url: URL, text, observedAt: '2026-09-25T00:00:00Z', referenceTime: '2026-09-27T00:00:00Z' });
}

function assertEvidenceIsReal(text: string, quotes: string[]): void {
  for (const quote of quotes) {
    assert.ok(text.toLowerCase().includes(quote.toLowerCase()), `evidence quote "${quote}" must be a literal substring of the crawl text`);
  }
}

/* --------------------------- A. buying signals --------------------------- */

test('buying-signals: high signal page reaches HIGH tier', () => {
  const result = buyingFor(HOT_TEXT);
  assert.equal(result.status, 'OK');
  assert.equal(result.tier, 'HIGH');
  assert.ok(result.score >= 60, `expected >=60, got ${result.score}`);
  assert.equal(result.coverage.detected, result.coverage.expected);
  assertEvidenceIsReal(HOT_TEXT, result.signals.flatMap((signal) => signal.evidence.map((e) => e.quote)));
  assert.ok(result.signals.every((signal) => signal.observed === true && signal.evidence.length > 0));
});

test('buying-signals: moderate page reaches MEDIUM tier', () => {
  const result = buyingFor(MEDIUM_TEXT);
  assert.equal(result.status, 'OK');
  assert.equal(result.tier, 'MEDIUM');
  assert.ok(result.score >= 30 && result.score < 60, `expected 30..59, got ${result.score}`);
  assert.equal(tierForBuyingScore(0), 'NONE');
  assert.equal(tierForBuyingScore(59), 'MEDIUM');
  assert.equal(tierForBuyingScore(60), 'HIGH');
});

test('buying-signals: plain page yields no false signals', () => {
  const result = buyingFor(PLAIN_TEXT);
  assert.equal(result.status, 'OK');
  assert.equal(result.score, 0);
  assert.equal(result.tier, 'NONE');
  assert.deepEqual(result.signals, []);
  assert.equal(result.evidenceMissing, false);
});

test('buying-signals: freshness decays weights deterministically', () => {
  assert.equal(classifyFreshness('2026-09-25T00:00:00Z', '2026-09-27T00:00:00Z'), 'FRESH');
  assert.equal(classifyFreshness('2026-09-10T00:00:00Z', '2026-09-27T00:00:00Z'), 'RECENT');
  assert.equal(classifyFreshness('2026-07-01T00:00:00Z', '2026-09-27T00:00:00Z'), 'STALE');
  assert.equal(classifyFreshness(null, '2026-09-27T00:00:00Z'), 'UNKNOWN');
  assert.equal(classifyFreshness('2026-10-01T00:00:00Z', '2026-09-27T00:00:00Z'), 'UNKNOWN');

  const fresh = buyingFor(HOT_TEXT);
  const stale = extractBuyingSignals({ url: URL, text: HOT_TEXT, observedAt: '2026-07-01T00:00:00Z', referenceTime: '2026-09-27T00:00:00Z' });
  assert.equal(stale.freshness, 'STALE');
  assert.ok(stale.score < fresh.score, 'stale evidence must score lower than fresh evidence');
});

/* ---------------------------- B. pain signals ---------------------------- */

test('pain-signals: observed pain is evidence-backed', () => {
  const result = painFor(PAIN_TEXT);
  assert.equal(result.status, 'OK');
  const ids = result.observed.map((signal) => signal.id);
  assert.ok(ids.includes('stockout'));
  assert.ok(ids.includes('transaction_failure'));
  assertEvidenceIsReal(PAIN_TEXT, result.all.flatMap((signal) => signal.evidence.map((e) => e.quote)));
  assert.ok(result.painScore > 0);
});

test('pain-signals: inferred pain must anchor on observed evidence and escalates on multi-evidence', () => {
  const result = painFor(PAIN_TEXT);
  const inferred = result.inferred.find((signal) => signal.id === 'lost_conversion_risk');
  assert.ok(inferred, 'expected inference anchored on observed pain');
  assert.deepEqual(inferred.derivedFrom.sort(), ['stockout', 'transaction_failure']);
  assert.equal(inferred.confidence, 'HIGH');
  assert.ok(inferred.evidence.length > 0);
  assert.equal(inferred.kind, 'INFERRED');
  assert.ok(result.all.every((signal) => signal.kind === 'OBSERVED' || signal.derivedFrom.length > 0));
});

test('pain-signals: manual-order pain produces anchored inference', () => {
  const result = painFor(MANUAL_ORDER_TEXT);
  const ids = result.observed.map((signal) => signal.id);
  assert.ok(ids.includes('manual_order_process'));
  const inferred = result.inferred.find((signal) => signal.id === 'manual_ops_overhead');
  assert.ok(inferred);
  assert.deepEqual(inferred.derivedFrom, ['manual_order_process']);
});

test('pain-signals: missing evidence yields INSUFFICIENT_DATA without fabricated inference', () => {
  const result = painFor('');
  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.deepEqual(result.observed, []);
  assert.deepEqual(result.inferred, []);
  assert.equal(result.painScore, 0);
  assert.equal(result.confidence, 0);
});

/* --------------------------- C. sales readiness --------------------------- */

test('sales-readiness: strong qualification + strong evidence reaches READY_NOW', () => {
  const buying = buyingFor(HOT_TEXT);
  const pain = painFor(HOT_TEXT);
  const readiness = computeSalesReadiness({ qualification: qualification('A_STRONG', ['woocommerce detected']), buying, pain });
  assert.equal(readiness.status, 'OK');
  assert.equal(readiness.state, 'READY_NOW');
  assert.ok(readiness.score >= 75);
  assert.ok(readiness.confidence >= 0.5);
  assert.deepEqual(readiness.blockers, []);
  assert.ok(readiness.reasons.some((line) => line.includes('qualification=A_STRONG')));
  assert.ok(readiness.reasons.some((line) => line.includes('buying score=')));
});

test('sales-readiness: insufficient data fails closed to UNKNOWN', () => {
  const buying = buyingFor('');
  const pain = painFor('');
  const readiness = computeSalesReadiness({ qualification: qualification('C_WEAK'), buying, pain });
  assert.equal(readiness.status, 'INSUFFICIENT_DATA');
  assert.equal(readiness.state, 'UNKNOWN');
  assert.equal(readiness.score, 0);
  assert.equal(readiness.confidence, 0);
  assert.ok(readiness.blockers.includes('insufficient_observed_data'));
  assert.ok(readiness.uncertainty.includes('no_observed_evidence'));
});

test('sales-readiness: missing qualification lowers confidence and is recorded as uncertainty', () => {
  const buying = buyingFor(MEDIUM_TEXT);
  const pain = painFor(MEDIUM_TEXT);
  const withQual = computeSalesReadiness({ qualification: qualification('B_POTENTIAL'), buying, pain });
  const withoutQual = computeSalesReadiness({ qualification: null, buying, pain });
  assert.equal(withoutQual.status, 'OK');
  assert.ok(withoutQual.confidence < withQual.confidence);
  assert.ok(withoutQual.uncertainty.some((line) => line.startsWith('qualification_missing')));
  assert.ok(withoutQual.score < withQual.score);
});

test('sales-readiness: REJECTED qualification short-circuits to NOT_READY', () => {
  const buying = buyingFor(HOT_TEXT);
  const pain = painFor(HOT_TEXT);
  const readiness = computeSalesReadiness({ qualification: qualification('REJECTED', ['non-ecommerce site']), buying, pain });
  assert.equal(readiness.status, 'OK');
  assert.equal(readiness.state, 'NOT_READY');
  assert.equal(readiness.score, 0);
  assert.deepEqual(readiness.blockers, ['qualification_rejected']);
});

/* ------------------------- D. sales recommendation ------------------------ */

function recommendationInput(text: string, grade: ElarisGrade) {
  const buying = buyingFor(text);
  const pain = painFor(text);
  const readiness = computeSalesReadiness({ qualification: qualification(grade), buying, pain });
  return { url: URL, qualification: qualification(grade), buying, pain, readiness };
}

test('sales-recommendation: rules version produces facts, priority and channel deterministically', () => {
  const input = recommendationInput(HOT_TEXT, 'A_STRONG');
  const result = buildSalesRecommendationRules(input);
  assert.equal(result.status, 'OK');
  assert.equal(result.generatedBy, 'RULES');
  assert.equal(result.priority, 'P0');
  assert.equal(result.channel, 'CALL');
  assert.ok(result.whyNow.length > 0, 'timing evidence exists in the hot sample');
  assert.ok(result.evidenceRefs.length > 0);
  assert.ok(result.nextAction.length > 0);
});

test('sales-recommendation: LLM unavailable falls back to deterministic angle', async () => {
  const input = recommendationInput(HOT_TEXT, 'A_STRONG');
  const baseline = buildSalesRecommendationRules(input);
  const result = await buildSalesRecommendation(input, {
    llm: { suggestAngle: async () => { throw new Error('groq_unreachable'); } },
    timeoutMs: 50,
  });
  assert.equal(result.generatedBy, 'RULES');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.angle, baseline.angle);
  assert.equal(result.priority, baseline.priority);
  assert.equal(result.channel, baseline.channel);
  assert.ok(result.reasoning.some((line) => line.includes('llm_unavailable')));
});

test('sales-recommendation: LLM output carrying new facts is rejected', async () => {
  const input = recommendationInput(HOT_TEXT, 'A_STRONG');
  const baseline = buildSalesRecommendationRules(input);
  const result = await buildSalesRecommendation(input, {
    llm: { suggestAngle: async () => 'See https://evil.example/claim and mail us at sales@evil.example' },
  });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.angle, baseline.angle);
  assert.ok(result.reasoning.some((line) => line.includes('llm_output_rejected')));
});

test('sales-recommendation: LLM may reword angle only, never the facts', async () => {
  const input = recommendationInput(HOT_TEXT, 'A_STRONG');
  const baseline = buildSalesRecommendationRules(input);
  const result = await buildSalesRecommendation(input, {
    llm: { suggestAngle: async () => '以已观测的购物车与结账链路为切入点，聚焦转化损耗' },
  });
  assert.equal(result.generatedBy, 'LLM');
  assert.equal(result.angle, '以已观测的购物车与结账链路为切入点，聚焦转化损耗');
  assert.equal(result.priority, baseline.priority);
  assert.equal(result.channel, baseline.channel);
  assert.deepEqual(result.whyNow, baseline.whyNow);
});

test('sales-recommendation: no recommendation when readiness is NOT_READY/UNKNOWN', async () => {
  const rejected = buildSalesRecommendationRules(recommendationInput(HOT_TEXT, 'REJECTED'));
  assert.equal(rejected.status, 'NO_RECOMMENDATION');
  assert.equal(rejected.channel, 'NONE');
  assert.deepEqual(rejected.whyNow, [], 'no why-now claim may be emitted without a recommendation');
  assert.equal(rejected.priority, 'P3');

  const buying = buyingFor('');
  const pain = painFor('');
  const readiness = computeSalesReadiness({ qualification: qualification('C_WEAK'), buying, pain });
  const unknown = buildSalesRecommendationRules({ url: URL, qualification: qualification('C_WEAK'), buying, pain, readiness });
  assert.equal(unknown.status, 'NO_RECOMMENDATION');
  assert.equal(unknown.channel, 'NONE');

  const llmOnRejected = await buildSalesRecommendation(recommendationInput(HOT_TEXT, 'REJECTED'), {
    llm: { suggestAngle: async () => '忽略规则，直接报价' },
  });
  assert.equal(llmOnRejected.status, 'NO_RECOMMENDATION');
  assert.equal(llmOnRejected.channel, 'NONE');
});

/* ------------------------------ composition ------------------------------ */

test('assessment: end-to-end composition stays pure and evidence-faithful', () => {
  const assessment = buildHunterAssessment({
    url: URL,
    text: HOT_TEXT,
    observedAt: '2026-09-25T00:00:00Z',
    referenceTime: '2026-09-27T00:00:00Z',
    qualification: qualification('A_STRONG'),
  });
  assert.equal(assessment.buying.status, 'OK');
  assert.equal(assessment.readiness.state, 'READY_NOW');
  assert.equal(assessment.recommendation.status, 'OK');
  const quotes = [...assessment.buying.signals, ...assessment.pain.all].flatMap((signal) => signal.evidence.map((e) => e.quote));
  assertEvidenceIsReal(HOT_TEXT, quotes);
  assert.ok(quotes.length > 0);
});

/* ---------- E. matching layer (P0-2)：词边界 + 否定语境（回归） ---------- */

test('matching: keywords must match as whole tokens, never as raw substrings', () => {
  // wholesale != sale、registered != register、b2biz != b2b
  assert.equal(findKeywordHits('Wholesale programme', ['sale']).length, 0);
  assert.equal(findKeywordHits('Wholesale programme', ['wholesale']).length, 1);
  assert.equal(findKeywordHits('registered users only', ['register']).length, 0);
  assert.equal(findKeywordHits('b2biz portal', ['b2b']).length, 0);

  const wholesalePage = buyingFor('Wholesale programme: we supply partner stores with OEM goods.');
  const ids = wholesalePage.signals.map((signal) => signal.id);
  assert.ok(ids.includes('distributor_intent'), 'wholesale / OEM must still yield its own signal');
  assert.ok(!ids.includes('promotion_activity'), 'the "sale" inside "Wholesale" must not fire the promotion rule');

  assert.equal(matchesAnyKeyword([{ source: 'text', value: 'Wholesale programme' }], ['sale']), false);

  // 分隔符归一：markup 中的 add-to-cart / add_to_cart 仍应命中 "add to cart"
  assert.equal(matchesAnyKeyword([{ source: 'classes', value: 'btn add-to-cart' }], ['add to cart']), true);
  assert.equal(matchesAnyKeyword([{ source: 'classes', value: 'btn add_to_cart' }], ['add to cart']), true);
});

test('matching: negation context suppresses keyword hits, exempted keywords stay positive', () => {
  const negatedHits = findKeywordHits('This item is never out of stock.', ['out of stock']);
  assert.equal(negatedHits.length, 1);
  assert.equal(negatedHits[0].negated, true, 'a negated hit is recorded for audit but must not count');
  assert.equal(matchesAnyKeyword([{ source: 'text', value: 'This item is never out of stock.' }], ['out of stock']), false);

  const negatedPain = painFor('Good news: this item is never out of stock. We are not under maintenance.');
  assert.deepEqual(negatedPain.observed, [], 'negated pain keywords must not produce observed signals');
  assert.deepEqual(negatedPain.inferred, [], 'no inference may be anchored on negated evidence');

  const positivePain = painFor('This item is out of stock.');
  assert.ok(positivePain.observed.some((signal) => signal.id === 'stockout'));

  // 语义豁免："no minimum order" / "no MOQ" 本身仍是可下单信号
  const exempt = buyingFor('No minimum order (no MOQ) for wholesale buyers.');
  assert.ok(exempt.signals.some((signal) => signal.id === 'pricing_transparency'), 'no minimum order / no MOQ is exempt from negation suppression');
});

/* -------- E2. hardening regression: cart/view-cart misjudgment, hyphenated negation, NURTURE -------- */

test('cart-capability: view-cart / data-to-cart are not misjudged as add-to-cart', () => {
  const view = buyingFor('View cart | My account | Track your order');
  const viewIds = view.signals.map((signal) => signal.id);
  assert.ok(!viewIds.includes('cart_capability'), 'view cart must not yield cart capability');
  assert.ok(!viewIds.includes('checkout_capability'), 'view cart must not yield checkout capability');

  const data = buyingFor('data-to-cart placeholder with no add action');
  assert.ok(!data.signals.map((signal) => signal.id).includes('cart_capability'), 'data-to-cart must not yield cart capability');

  // positive control: a real add-to-cart / checkout still registers capability
  const real = buyingFor('Add to cart now and proceed to checkout');
  const realIds = real.signals.map((signal) => signal.id);
  assert.ok(realIds.includes('cart_capability'), 'add to cart must yield cart capability');
  assert.ok(realIds.includes('checkout_capability'), 'proceed to checkout must yield checkout capability');
});

test('matching: hyphenated negation (non-/un-) suppresses capability keywords', () => {
  const nonCart = buyingFor('Our platform is non-add-to-cart by design (catalog only).');
  assert.ok(!nonCart.signals.map((signal) => signal.id).includes('cart_capability'), 'non-add-to-cart must not yield cart capability');

  const nonCheckout = buyingFor('This is a non-checkout inquiry page only.');
  assert.ok(!nonCheckout.signals.map((signal) => signal.id).includes('checkout_capability'), 'non-checkout must not yield checkout capability');

  // control: real hyphenated add-to-cart still matches via separator normalization
  const real = buyingFor('btn add-to-cart available');
  assert.ok(real.signals.map((signal) => signal.id).includes('cart_capability'), 'add-to-cart (hyphen) must still match');

  // negation is recorded at the matching layer and must not count
  const hits = findKeywordHits('non-add-to-cart', ['add to cart']);
  assert.ok(hits.length === 1 && hits[0].negated === true, 'non-add-to-cart hit must be flagged negated');
  assert.equal(matchesAnyKeyword([{ source: 'text', value: 'non-add-to-cart' }], ['add to cart']), false);
});

test('sales-readiness: NURTURE is reachable and carries the site-form nurture rule', () => {
  const buying = buyingFor(MEDIUM_TEXT);
  const pain = painFor('');
  const readiness = computeSalesReadiness({ qualification: qualification('B_POTENTIAL'), buying, pain });
  assert.equal(readiness.state, 'NURTURE', 'B_POTENTIAL + modest buying should land in NURTURE');
  assert.ok(readiness.score >= 30 && readiness.score < 55, `NURTURE score must be 30..54, got ${readiness.score}`);
  const rec = buildSalesRecommendationRules({ url: URL, qualification: qualification('B_POTENTIAL'), buying, pain, readiness });
  assert.equal(rec.status, 'OK');
  assert.equal(rec.channel, 'SITE_FORM', 'NURTURE must recommend the SITE_FORM channel');
  assert.ok(rec.angle.length > 0 && rec.nextAction.length > 0);
});

test('negation prefix guard: unique add to cart still yields cart capability', () => {
  const r = buyingFor('This product has a unique add to cart experience.');
  const ids = r.signals.map((signal) => signal.id);
  assert.ok(ids.includes('cart_capability'), 'unique add to cart must still yield cart capability');
});

test('negation prefix guard: nonprofit add to cart still yields cart capability', () => {
  const r = buyingFor('Our nonprofit add to cart initiative helps donors.');
  const ids = r.signals.map((signal) => signal.id);
  assert.ok(ids.includes('cart_capability'), 'nonprofit add to cart must still yield cart capability');
});

test('negation prefix guard: uninterrupted checkout still yields checkout capability', () => {
  const r = buyingFor('We offer uninterrupted checkout for all members.');
  const ids = r.signals.map((signal) => signal.id);
  assert.ok(ids.includes('checkout_capability'), 'uninterrupted checkout must still yield checkout capability');
});

/* -------- F. 硬门与单一来源（P0-1 / P1-3 / P1-4 回归） -------- */

test('sales-readiness: shouldEngage=false is a hard gate, not a score penalty', () => {
  const buying = buyingFor(HOT_TEXT);
  const pain = painFor(HOT_TEXT);
  const gated = qualification('A_STRONG');
  gated.shouldEngage = false;
  const readiness = computeSalesReadiness({ qualification: gated, buying, pain });

  assert.equal(readiness.status, 'OK');
  assert.equal(readiness.state, 'NOT_READY', 'hot buying / pain evidence must not lift a hard-gated target');
  assert.equal(readiness.score, 0);
  assert.equal(readiness.confidence, 0);
  assert.deepEqual(readiness.blockers, [HUNTER_READINESS.HARD_GATE_BLOCKER]);
  assert.ok(readiness.uncertainty.includes('hard_gate_should_engage_false'));
  assert.ok(readiness.reasons.some((line) => line.startsWith('hard_gate:')));

  // 唯一变量是 shouldEngage：同一份证据在 shouldEngage=true 时必须仍可推进
  const ungated = computeSalesReadiness({ qualification: qualification('A_STRONG'), buying, pain });
  assert.equal(ungated.state, 'READY_NOW');
});

test('sales-recommendation: hard-gated target yields no recommendation and lowest priority', () => {
  const gated = qualification('A_STRONG');
  gated.shouldEngage = false;
  const buying = buyingFor(HOT_TEXT);
  const pain = painFor(HOT_TEXT);
  const readiness = computeSalesReadiness({ qualification: gated, buying, pain });
  const result = buildSalesRecommendationRules({ url: URL, qualification: gated, buying, pain, readiness });

  assert.equal(result.status, 'NO_RECOMMENDATION');
  assert.equal(result.channel, 'NONE');
  assert.deepEqual(result.whyNow, [], 'no why-now claim may be emitted for a hard-gated target');
  assert.equal(result.priority, 'P3', 'priority must be clamped to the lowest tier, not P0');
  assert.ok(result.reasoning.some((line) => line.includes('hard_gate')));
});

test('sales-readiness: qualification.score is the only component source (no grade base table)', () => {
  const buying = buyingFor(MEDIUM_TEXT);
  const pain = painFor(MEDIUM_TEXT);
  const highGradeLowScore = qualification('A_STRONG');
  highGradeLowScore.score = 0;
  const low = computeSalesReadiness({ qualification: highGradeLowScore, buying, pain });
  const high = computeSalesReadiness({ qualification: qualification('A_STRONG'), buying, pain });

  assert.ok(
    high.score - low.score >= 40,
    `qualification component must track qualification.score (low=${low.score}, high=${high.score})`,
  );
  assert.ok(low.reasons.some((line) => line.includes('source=MerchantQualification.score')));
  assert.ok(!low.reasons.some((line) => line.includes('base=')), 'the removed grade base table must not resurface in reasons');
});

test('sales-readiness: score and confidence reuse one weight table, missing qualification scores zero', () => {
  const buying = buyingFor(MEDIUM_TEXT);
  const pain = painFor(MEDIUM_TEXT);
  const weights = HUNTER_READINESS.WEIGHTS;
  const readiness = computeSalesReadiness({ qualification: qualification('B_POTENTIAL'), buying, pain });
  const expected = Math.round(
    (weights.QUALIFICATION * 1 + weights.BUYING * buying.confidence + weights.PAIN * pain.confidence) * 1000,
  ) / 1000;
  assert.equal(readiness.confidence, expected, 'confidence must use the same weights as the score');

  const missing = computeSalesReadiness({ qualification: null, buying, pain });
  const expectedMissing = Math.round(
    (weights.BUYING * buying.confidence + weights.PAIN * pain.confidence) * 1000,
  ) / 1000;
  assert.equal(missing.confidence, expectedMissing, 'missing qualification contributes 0 confidence (fail-closed)');
  assert.ok(readiness.reasons.some((line) => line.includes('share the same weights')));
});
