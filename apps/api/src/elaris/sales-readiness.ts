/**
 * C. sales-readiness — 确定性成单就绪度（规则优先，含不确定性与解释）。
 *
 * 复用既有 qualification（唯一资格分来源 = qualification.score），叠加 buying / pain 的
 * 加权贡献与结构性加成；证据不足、资格被拒、或 shouldEngage=false 一律 fail-closed
 * （UNKNOWN / NOT_READY），buying / pain 分数不得绕过硬门。
 * score 分量与 confidence 共用同一组权重（HUNTER_READINESS.WEIGHTS）。
 * 不写库、不新增 Company/Opportunity，输出仅为可解释的只读结果。
 */
import { HUNTER_READINESS } from './hunter.constants';
import type { ReadinessState, SalesReadinessInput, SalesReadinessResult } from './hunter.types';

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stateFor(score: number): ReadinessState {
  for (const { state, min } of HUNTER_READINESS.STATE_THRESHOLDS) {
    if (score >= min) return state;
  }
  return 'NOT_READY';
}

export function computeSalesReadiness(input: SalesReadinessInput): SalesReadinessResult {
  const { qualification, buying, pain } = input;
  const uncertainty: string[] = [];
  const blockers: string[] = [];
  const reasons: string[] = [];

  if (!qualification) uncertainty.push('qualification_missing: falling back to buying/pain evidence only');

  // fail-closed #1：没有任何观测证据 -> 不给出就绪度判断。
  if (buying.status === 'INSUFFICIENT_DATA') {
    return {
      status: 'INSUFFICIENT_DATA',
      state: 'UNKNOWN',
      score: 0,
      confidence: 0,
      components: { qualification: 0, buying: 0, pain: 0, adjustments: 0 },
      reasons: ['no_observed_evidence: buying signals could not be evidenced from crawl output'],
      blockers: ['insufficient_observed_data'],
      uncertainty: [...uncertainty, 'no_observed_evidence'],
      recommendedAction: HUNTER_READINESS.ACTIONS.UNKNOWN,
    };
  }

  // fail-closed #2：既有资格门禁为 REJECTED -> 不推进。
  if (qualification && qualification.grade === 'REJECTED') {
    return {
      status: 'OK',
      state: 'NOT_READY',
      score: 0,
      confidence: 0,
      components: { qualification: 0, buying: buying.score, pain: pain.painScore, adjustments: 0 },
      reasons: [`qualification=REJECTED: ${qualification.reasons.join('; ') || 'rejected by qualification gate'}`],
      blockers: ['qualification_rejected'],
      uncertainty,
      recommendedAction: HUNTER_READINESS.ACTIONS.NOT_READY,
    };
  }

  // fail-closed #3（P0-1 硬门）：既有资格门禁明确要求不触达 -> 一律 NOT_READY，
  // buying / pain 分数不得把该目标重新提升为 READY_SOON / READY_NOW。
  if (qualification && qualification.shouldEngage === false) {
    return {
      status: 'OK',
      state: 'NOT_READY',
      score: 0,
      confidence: 0,
      components: { qualification: 0, buying: buying.score, pain: pain.painScore, adjustments: 0 },
      reasons: [
        `hard_gate: qualification.shouldEngage=false (grade=${qualification.grade}, score=${qualification.score}) -> fail-closed`,
        `observed buying=${buying.score} / pain=${pain.painScore} recorded but must not lift a hard-gated target`,
        ...qualification.reasons,
      ],
      blockers: [HUNTER_READINESS.HARD_GATE_BLOCKER],
      uncertainty: [...uncertainty, 'hard_gate_should_engage_false'],
      recommendedAction: HUNTER_READINESS.ACTIONS.NOT_READY,
    };
  }

  // P1-4：唯一资格分来源 = qualification.score（不再维护 grade -> base 的第二张表）。
  const qualificationScore = qualification ? qualification.score : HUNTER_READINESS.MISSING_QUALIFICATION_COMPONENT;
  const qualificationComponent = Math.round(qualificationScore * HUNTER_READINESS.WEIGHTS.QUALIFICATION);
  const buyingComponent = Math.round(buying.score * HUNTER_READINESS.WEIGHTS.BUYING);
  const painComponent = Math.round(pain.painScore * HUNTER_READINESS.WEIGHTS.PAIN);

  let adjustments = 0;
  const adjustmentNotes: string[] = [];
  const buyingIds = new Set(buying.signals.map((signal) => signal.id));
  if (buyingIds.has('distributor_intent')) {
    adjustments += HUNTER_READINESS.ADJUSTMENTS.DISTRIBUTOR_INTENT;
    adjustmentNotes.push(`+${HUNTER_READINESS.ADJUSTMENTS.DISTRIBUTOR_INTENT} distributor_intent observed`);
  }
  const operationalPain = pain.observed.some((signal) => signal.id === 'stockout' || signal.id === 'manual_order_process');
  if (operationalPain) {
    adjustments += HUNTER_READINESS.ADJUSTMENTS.OBSERVED_OPERATIONAL_PAIN;
    adjustmentNotes.push(`+${HUNTER_READINESS.ADJUSTMENTS.OBSERVED_OPERATIONAL_PAIN} operational pain observed`);
  }
  adjustments = Math.min(adjustments, HUNTER_READINESS.ADJUSTMENTS.CAP);

  const score = clamp(qualificationComponent + buyingComponent + painComponent + adjustments);

  // P1-3：confidence 与 score 分量共用 HUNTER_READINESS.WEIGHTS，杜绝双权重语义；
  // 资格缺失时资格侧置信度按 0 计入（fail-closed），不给任何乐观替代值。
  const qualificationConfidence = qualification ? 1 : 0;
  const confidence =
    Math.round(
      (HUNTER_READINESS.WEIGHTS.QUALIFICATION * qualificationConfidence +
        HUNTER_READINESS.WEIGHTS.BUYING * buying.confidence +
        HUNTER_READINESS.WEIGHTS.PAIN * pain.confidence) * 1000,
    ) / 1000;

  let state = stateFor(score);
  if (state === 'READY_NOW' && confidence < HUNTER_READINESS.MIN_CONFIDENCE) {
    state = 'READY_SOON';
    uncertainty.push('low_confidence_downgrade: READY_NOW downgraded (confidence below threshold)');
  }
  if (pain.status === 'INSUFFICIENT_DATA') uncertainty.push('pain_evidence_missing');
  if (buying.freshness === 'UNKNOWN' || buying.freshness === 'STALE') {
    uncertainty.push(`buying_freshness_${buying.freshness.toLowerCase()}`);
  }

  reasons.push(qualification
    ? `qualification=${qualification.grade} score=${qualification.score} -> ${qualificationComponent} (source=${HUNTER_READINESS.QUALIFICATION_SCORE_SOURCE}, weight ${HUNTER_READINESS.WEIGHTS.QUALIFICATION})`
    : `qualification=missing -> ${HUNTER_READINESS.MISSING_QUALIFICATION_COMPONENT} (fail-closed, uncertainty recorded)`);
  reasons.push(`buying score=${buying.score} tier=${buying.tier} -> ${buyingComponent} (weight ${HUNTER_READINESS.WEIGHTS.BUYING})`);
  reasons.push(`pain pressure=${pain.painScore} (observed=${pain.observed.length}, inferred=${pain.inferred.length}) -> ${painComponent} (weight ${HUNTER_READINESS.WEIGHTS.PAIN})`);
  reasons.push(...adjustmentNotes);
  reasons.push(`weights: qualification ${HUNTER_READINESS.WEIGHTS.QUALIFICATION} / buying ${HUNTER_READINESS.WEIGHTS.BUYING} / pain ${HUNTER_READINESS.WEIGHTS.PAIN} (score and confidence share the same weights)`);
  reasons.push(`confidence=${confidence} (qualification ${qualificationConfidence}, buying coverage ${buying.confidence}, pain coverage ${pain.confidence})`);

  return {
    status: 'OK',
    state,
    score,
    confidence,
    components: {
      qualification: qualificationComponent,
      buying: buyingComponent,
      pain: painComponent,
      adjustments,
    },
    reasons,
    blockers,
    uncertainty,
    recommendedAction: HUNTER_READINESS.ACTIONS[state] ?? HUNTER_READINESS.ACTIONS.UNKNOWN,
  };
}
