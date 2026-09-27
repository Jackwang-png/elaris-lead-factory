/**
 * A. buying-signals — 观测型购买信号提取（纯函数，evidence-first）。
 *
 * 与既有实现的关系：复用 crawl/parse 产物（text / classes / links），
 * 不新建采集链路、不引入 Agent Runtime；本模块只做确定性关键词取证与加权聚合。
 * 每条信号都必须携带真实原文片段，无法取证即丢弃并记录，绝不编造。
 *
 * 匹配层（本模块同时承载，供 pain-signals 复用，避免在 V1.4 表面新增文件）：
 * - 词边界匹配：关键字必须作为独立 token 出现，禁止裸 substring
 *   （wholesale ≠ sale、registered ≠ register、b2biz ≠ b2b）；
 * - 分隔符归一：关键字空格同时匹配空格 / 连字符 / 下划线
 *   （"add to cart" 可命中 markup 中的 add-to-cart / add_to_cart）；
 * - 否定语境抑制：命中前窗口内出现否定词即不计命中
 *   （never out of stock / not under maintenance 不得生成 pain）；
 * - 证据偏移：quote 一律由原始片段按命中偏移截取，附带 start/end，可机器校验。
 */
import {
  HUNTER_BUYING_RULES,
  HUNTER_BUYING_TIERS,
  HUNTER_CLAUSE_BOUNDARIES,
  HUNTER_FRESHNESS,
  HUNTER_LIMITS,
  HUNTER_MATCHING,
} from './hunter.constants';
import type { ParsedHtml } from './html-parser';
import type {
  BuyingSignal,
  BuyingSignalsResult,
  BuyingTier,
  Freshness,
  HunterObservations,
  SignalEvidence,
  SignalSource,
} from './hunter.types';

export interface Segment {
  source: SignalSource;
  value: string;
}

export function parseObservedDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 采集时间 -> 新鲜度。未来时间视为不可信（UNKNOWN），缺时间也按 UNKNOWN 降权。 */
export function classifyFreshness(
  observedAt?: string | Date | null,
  referenceTime?: string | Date | null,
): Freshness {
  const observed = parseObservedDate(observedAt);
  if (!observed) return 'UNKNOWN';
  const reference = parseObservedDate(referenceTime) ?? new Date();
  const days = (reference.getTime() - observed.getTime()) / 86_400_000;
  if (days < 0) return 'UNKNOWN';
  if (days <= HUNTER_FRESHNESS.FRESH_DAYS) return 'FRESH';
  if (days <= HUNTER_FRESHNESS.RECENT_DAYS) return 'RECENT';
  return 'STALE';
}

export interface KeywordHit {
  /** 规则表原始关键字。 */
  keyword: string;
  /** 命中起点（segment.value 的字符偏移，0-based）。 */
  start: number;
  /** 命中终点（不含）：满足 value.slice(start, end) === text。 */
  end: number;
  /** 实际命中文本，恒为 segment.value 的子串。 */
  text: string;
  /** 是否处于否定语境：true 时不计命中、不得取证。 */
  negated: boolean;
}

function dedupeValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

/**
 * 观测片段规范化：text 为单一片段，classes / links 逐条成段。
 * 逐条成段使 quote 精确落在单个 class / link 上，来源与偏移均可机器校验。
 */
export function buildObservationSegments(observations: HunterObservations): Segment[] {
  const raw: Array<[SignalSource, string]> = [
    ['text', observations.text ?? ''],
    ...dedupeValues(observations.classes ?? []).map((value): [SignalSource, string] => ['classes', value]),
    ...dedupeValues(observations.links ?? []).map((value): [SignalSource, string] => ['links', value]),
  ];
  return raw
    .filter(([, value]) => value.trim().length > 0)
    .map(([source, value]) => ({ source, value }));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 关键字 -> 词边界正则；空格归一为 [\s_-]+（add to cart == add-to-cart == add_to_cart）。 */
function keywordPattern(keyword: string): RegExp | null {
  const normalized = keyword.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized.length === 0) return null;
  const body = normalized.split(' ').map(escapeRegex).join('[\\s_-]+');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'gi');
}

/** 否定语境：命中前窗口的末尾若干 token 出现否定词即成立（跨子句边界截断）。 */
function isNegatedContext(value: string, index: number): boolean {
  const from = Math.max(0, index - HUNTER_MATCHING.NEGATION_WINDOW);
  let context = value.slice(from, index).replace(/[\u2018\u2019]/g, "'").toLowerCase();
  const boundary = Math.max(...HUNTER_CLAUSE_BOUNDARIES.map((char) => context.lastIndexOf(char)));
  if (boundary >= 0) context = context.slice(boundary + 1);
  const tokens = context.split(/[^a-z0-9']+/).filter((token) => token.length > 0);
  const tail = tokens.slice(-HUNTER_MATCHING.NEGATION_LOOKBACK_TOKENS);
  const exemptTokens = HUNTER_MATCHING.NEGATION_EXEMPT_TOKENS as readonly string[];
  const negations = HUNTER_MATCHING.NEGATION_TOKENS as readonly string[];
  if (tail.some((token) => exemptTokens.includes(token))) return false;
  return tail.some((token) => negations.includes(token));
}

export interface MatchOptions {
  /** 是否启用否定语境抑制（buying / pain 均启用）。 */
  suppressNegated?: boolean;
  /** 语义豁免关键字（否定形式本身即正向信号）。 */
  negationExempt?: string[];
}

const MATCH_OPTIONS: MatchOptions = {
  suppressNegated: true,
  negationExempt: [...HUNTER_MATCHING.NEGATION_EXEMPT_KEYWORDS] as string[],
};

/** 词边界 + 否定语境匹配：返回全部命中（含否定命中，便于测试与审计）。 */
export function findKeywordHits(
  value: string,
  keywords: string[],
  options: MatchOptions = MATCH_OPTIONS,
): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const keyword of keywords) {
    const pattern = keywordPattern(keyword);
    if (!pattern) continue;
    const exempt = (options.negationExempt ?? []).includes(keyword.trim().toLowerCase());
    let match: RegExpExecArray | null = pattern.exec(value);
    while (match !== null) {
      const start = match.index;
      hits.push({
        keyword,
        start,
        end: start + match[0].length,
        text: match[0],
        negated: options.suppressNegated === true && !exempt && isNegatedContext(value, start),
      });
      match = pattern.exec(value);
    }
  }
  return hits.sort((a, b) => a.start - b.start || a.end - b.end || a.keyword.localeCompare(b.keyword));
}

/** 规则命中判定：必须存在至少一条非否定命中。 */
export function matchesAnyKeyword(segments: Segment[], keywords: string[]): boolean {
  return segments.some((segment) => findKeywordHits(segment.value, keywords).some((hit) => !hit.negated));
}

/** 取证：quote 一律按命中偏移从采集片段截取，保证是真实子串（禁止模型生成）。 */
export function collectSegmentEvidence(
  segments: Segment[],
  keywords: string[],
  url: string,
  factId?: string,
): SignalEvidence[] {
  const evidence: SignalEvidence[] = [];
  for (const segment of segments) {
    const hit = findKeywordHits(segment.value, keywords).find((item) => !item.negated);
    if (!hit) continue; // 每片段每规则最多一条证据，且只取非否定命中
    evidence.push({
      sourceUrl: url,
      quote: segment.value.slice(hit.start, hit.end),
      start: hit.start,
      end: hit.end,
      source: segment.source,
      ...(factId ? { factId } : {}),
    });
    if (evidence.length >= HUNTER_LIMITS.MAX_EVIDENCE_PER_SIGNAL) break;
  }
  return evidence;
}

export function tierForBuyingScore(score: number): BuyingTier {
  for (const { tier, min } of HUNTER_BUYING_TIERS) {
    if (score >= min) return tier;
  }
  return 'NONE';
}

export function extractBuyingSignals(observations: HunterObservations): BuyingSignalsResult {
  const segments = buildObservationSegments(observations);
  const freshness = classifyFreshness(observations.observedAt, observations.referenceTime);
  const decay = HUNTER_FRESHNESS.DECAY[freshness] ?? HUNTER_FRESHNESS.DECAY.UNKNOWN;
  const expected = HUNTER_BUYING_RULES.length;

  if (segments.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      signals: [],
      score: 0,
      tier: 'NONE',
      confidence: 0,
      coverage: { detected: 0, expected },
      freshness,
      evidenceMissing: false,
      droppedCandidates: [],
      reasons: ['no_observed_content: crawl produced no text/markup to match against'],
      notes: ['fail-closed: no signal emitted without observed evidence'],
    };
  }

  const signals: BuyingSignal[] = [];
  const droppedCandidates: string[] = [];

  for (const rule of HUNTER_BUYING_RULES) {
    const matched = matchesAnyKeyword(segments, rule.keywords);
    if (!matched) continue;
    const evidence = collectSegmentEvidence(segments, rule.keywords, observations.url, observations.factIds?.[rule.id]);
    if (evidence.length === 0) {
      // 理论上不可达：命中必然可截取子串。保留以防规则表被改动后出现静默丢失。
      droppedCandidates.push(rule.id);
      continue;
    }
    signals.push({
      id: rule.id,
      label: rule.label,
      category: rule.category,
      strength: rule.strength,
      baseWeight: rule.weight,
      effectiveWeight: Math.round(rule.weight * decay * 100) / 100,
      freshness,
      observed: true,
      evidence,
    });
  }

  const rawScore = signals.reduce((sum, signal) => sum + signal.effectiveWeight, 0);
  const score = Math.min(HUNTER_LIMITS.MAX_SIGNAL_SCORE, Math.round(rawScore));
  const reasons = [
    `matched ${signals.length}/${expected} buying rules`,
    `freshness=${freshness} (weight decay ${decay})`,
    `aggregate score=${score} -> tier ${tierForBuyingScore(score)}`,
  ];
  const notes: string[] = [];
  if (freshness === 'UNKNOWN') notes.push('freshness_unknown: weights decayed (fail-closed bias)');
  if (droppedCandidates.length > 0) notes.push(`evidence_unavailable: dropped ${droppedCandidates.join(',')}`);

  return {
    status: 'OK',
    signals,
    score,
    tier: tierForBuyingScore(score),
    confidence: Math.round((signals.length / expected) * 1000) / 1000,
    coverage: { detected: signals.length, expected },
    freshness,
    evidenceMissing: droppedCandidates.length > 0,
    droppedCandidates,
    reasons,
    notes,
  };
}

/** 适配既有解析产物（html-parser 输出），不新增采集链路。 */
export function buyingSignalsFromParsed(
  parsed: ParsedHtml,
  url: string,
  observedAt?: string | Date | null,
  referenceTime?: string | Date | null,
  factIds?: Record<string, string>,
): BuyingSignalsResult {
  const text = [parsed.title, parsed.metaDescription, parsed.textSnippet]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
  return extractBuyingSignals({
    url,
    text,
    classes: parsed.classes ?? [],
    links: parsed.links ?? [],
    observedAt,
    referenceTime,
    factIds,
  });
}
