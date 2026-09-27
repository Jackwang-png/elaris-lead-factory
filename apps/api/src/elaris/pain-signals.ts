/**
 * B. pain-signals — 痛点信号提取（observed vs inferred 严格分离）。
 *
 * 规则：
 * - OBSERVED：词边界命中（禁止裸 substring）+ 否定语境抑制 + 真实原文片段，才允许输出。
 *   "never out of stock" / "not under maintenance" 属否定语义，不得生成对应 pain。
 * - INFERRED：必须锚定已命中的观测信号（derivedFrom 非空），且携带 provenance；
 *   无观测支撑时一律不输出（禁止编造 pain）。
 * - 采不到内容 => INSUFFICIENT_DATA，观测与推断均为空（fail-closed）。
 */
import { HUNTER_FRESHNESS, HUNTER_LIMITS, HUNTER_PAIN_INFERENCE_RULES, HUNTER_PAIN_OBSERVED_RULES } from './hunter.constants';
import { buildObservationSegments, classifyFreshness, collectSegmentEvidence, matchesAnyKeyword } from './buying-signals';
import type {
  ConfidenceLevel,
  HunterObservations,
  PainSignal,
  PainSignalsResult,
} from './hunter.types';

function escalate(level: ConfidenceLevel): ConfidenceLevel {
  if (level === 'LOW') return 'MEDIUM';
  if (level === 'MEDIUM') return 'HIGH';
  return 'HIGH';
}

export function extractPainSignals(observations: HunterObservations): PainSignalsResult {
  const segments = buildObservationSegments(observations);
  const freshness = classifyFreshness(observations.observedAt, observations.referenceTime);
  const expected = HUNTER_PAIN_OBSERVED_RULES.length;

  if (segments.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      observed: [],
      inferred: [],
      all: [],
      painScore: 0,
      confidence: 0,
      coverage: { detected: 0, expected },
      freshness,
      evidenceMissing: false,
      droppedCandidates: [],
      reasons: ['no_observed_content: crawl produced no text/markup to match against'],
      notes: ['fail-closed: inferred pain suppressed (no observation anchor)'],
    };
  }

  const observed: PainSignal[] = [];
  const droppedCandidates: string[] = [];

  for (const rule of HUNTER_PAIN_OBSERVED_RULES) {
    const matched = matchesAnyKeyword(segments, rule.keywords);
    if (!matched) continue;
    const evidence = collectSegmentEvidence(segments, rule.keywords, observations.url, observations.factIds?.[rule.id]);
    if (evidence.length === 0) {
      droppedCandidates.push(rule.id);
      continue;
    }
    observed.push({
      id: rule.id,
      label: rule.label,
      kind: 'OBSERVED',
      severity: rule.severity,
      confidence: rule.severity,
      weight: rule.weight,
      derivedFrom: [],
      evidence,
    });
  }

  const observedIds = new Set(observed.map((signal) => signal.id));
  const observedWeight = observed.reduce((sum, signal) => sum + signal.weight, 0);

  const inferred: PainSignal[] = [];
  for (const rule of HUNTER_PAIN_INFERENCE_RULES) {
    const anchors = rule.requiresAny.filter((id) => observedIds.has(id));
    if (anchors.length === 0) continue; // 无观测锚点 -> 不推断（禁止编造）
    const anchorEvidence = observed
      .filter((signal) => anchors.includes(signal.id))
      .flatMap((signal) => signal.evidence)
      .slice(0, HUNTER_LIMITS.MAX_EVIDENCE_PER_SIGNAL);
    const multi = rule.escalateOnMultiEvidence && anchors.length >= 2;
    inferred.push({
      id: rule.id,
      label: rule.label,
      kind: 'INFERRED',
      severity: multi ? escalate(rule.confidence) : rule.confidence,
      confidence: multi ? escalate(rule.confidence) : rule.confidence,
      weight: Math.round(observedWeight * 0.5),
      derivedFrom: anchors,
      evidence: anchorEvidence,
    });
  }

  const inferredContribution = inferred.reduce((sum, signal) => sum + signal.weight * 0.5, 0);
  const painScore = Math.min(HUNTER_LIMITS.MAX_SIGNAL_SCORE, Math.round(observedWeight + inferredContribution));
  const reasons = [
    `observed ${observed.length}/${expected} pain rules (${observedIds.size ? [...observedIds].join(',') : 'none'})`,
    `inferred ${inferred.length} signal(s) anchored on observed evidence`,
    `pain pressure score=${painScore}`,
  ];
  const notes: string[] = [];
  if (inferred.length === 0) notes.push('no_inference_emitted: insufficient observed anchors (fail-closed)');
  if (freshness === 'UNKNOWN') notes.push('freshness_unknown: recency not verifiable');

  return {
    status: 'OK',
    observed,
    inferred,
    all: [...observed, ...inferred],
    painScore,
    confidence: Math.round((observed.length / expected) * 1000) / 1000,
    coverage: { detected: observed.length, expected },
    freshness,
    evidenceMissing: droppedCandidates.length > 0,
    droppedCandidates,
    reasons,
    notes,
  };
}
