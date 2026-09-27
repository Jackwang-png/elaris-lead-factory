/**
 * D. sales-recommendation — 推荐进攻角度 / 下一步动作 / why-now / 渠道。
 *
 * 确定性部分（rules）负责一切事实：priority、channel、why-now、nextAction 均不可被 LLM 改写；
 * 可选 LLM 端口只允许对 angle 文案做语义润色，任何失败/越界输出都会回退到规则版本（fail-closed）。
 */
import { ELARIS_CONSTANTS } from './elaris.constants';
import { HUNTER_RECOMMENDATION } from './hunter.constants';
import type {
  LeadPriority,
  RecommendationChannel,
  SalesAnglePort,
  SalesRecommendation,
  SalesRecommendationInput,
} from './hunter.types';

/** 资格硬门 / 资格拒绝导致的阻断：禁止推进销售动作，priority 固定为最低档。 */
const HARD_GATE_BLOCKERS = ['qualification_should_engage_false', 'qualification_rejected'];

/** 纯规则版本（LLM 不可用时的确定性兜底，也是 LLM 输出的事实基线）。 */
export function buildSalesRecommendationRules(input: SalesRecommendationInput): SalesRecommendation {
  const { qualification, buying, pain, readiness } = input;
  const priority: LeadPriority = qualification
    ? (ELARIS_CONSTANTS.LEAD_PRIORITY[qualification.grade] as LeadPriority | undefined) ?? 'P3'
    : 'P3';
  const hardGated = readiness.blockers.some((blocker) => HARD_GATE_BLOCKERS.includes(blocker));

  const evidenceRefs = [
    ...buying.signals.map((signal) => `${signal.id}:${signal.evidence[0]?.quote ?? ''}`),
    ...pain.observed.map((signal) => `${signal.id}:${signal.evidence[0]?.quote ?? ''}`),
  ];

  const whyNow: string[] = [];
  for (const signal of buying.signals) {
    if (!HUNTER_RECOMMENDATION.TIMING_SIGNAL_IDS.includes(signal.id)) continue;
    whyNow.push(`${signal.id} observed: "${signal.evidence[0]?.quote ?? ''}"`);
  }
  for (const signal of pain.observed) {
    if (signal.severity !== 'HIGH') continue;
    whyNow.push(`${signal.id} observed: "${signal.evidence[0]?.quote ?? ''}"`);
  }

  const reasoning = [
    `readiness state=${readiness.state} score=${readiness.score} confidence=${readiness.confidence}`,
    `buying tier=${buying.tier} score=${buying.score}; pain pressure=${pain.painScore}`,
  ];

  if (readiness.state === 'UNKNOWN' || readiness.state === 'NOT_READY') {
    if (whyNow.length === 0) reasoning.push('no_timing_evidence: no why-now claim emitted');
    if (hardGated) reasoning.push('hard_gate: shouldEngage=false -> recommendation suppressed (fail-closed)');
    return {
      status: 'NO_RECOMMENDATION',
      generatedBy: 'RULES',
      fallbackUsed: false,
      angle: hardGated ? HUNTER_RECOMMENDATION.HARD_GATE_ANGLE : HUNTER_RECOMMENDATION.NO_RECOMMENDATION_ANGLE,
      nextAction: readiness.recommendedAction,
      whyNow: [],
      channel: 'NONE',
      // P0-1：硬门/拒绝的目标一律最低优先级，不得因 buying / pain 分数被提前。
      priority: hardGated
        ? (HUNTER_RECOMMENDATION.BLOCKED_PRIORITY as LeadPriority)
        : readiness.state === 'NOT_READY' ? priority : 'P3',
      reasoning: [
        ...reasoning,
        ...(hardGated ? ['priority clamped: hard gate blocks advancement'] : []),
        ...(readiness.blockers.length ? [`blockers=${readiness.blockers.join(',')}`] : []),
      ],
      evidenceRefs,
    };
  }

  if (whyNow.length === 0) reasoning.push('no_timing_evidence: no why-now claim emitted');

  const channel = (HUNTER_RECOMMENDATION.CHANNEL_BY_STATE[readiness.state] as RecommendationChannel | undefined) ?? 'NONE';

  return {
    status: 'OK',
    generatedBy: 'RULES',
    fallbackUsed: false,
    angle: HUNTER_RECOMMENDATION.ANGLE_BY_STATE[readiness.state] ?? HUNTER_RECOMMENDATION.ANGLE_BY_STATE.NURTURE,
    nextAction: HUNTER_RECOMMENDATION.NEXT_ACTION_BY_STATE[readiness.state] ?? readiness.recommendedAction,
    whyNow,
    channel,
    priority,
    reasoning,
    evidenceRefs,
  };
}

/** LLM 输出白名单校验：只允许纯文本措辞，禁止夹带 URL / 邮箱等新事实载体。 */
function isAcceptableAngle(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > HUNTER_RECOMMENDATION.MAX_ANGLE_LENGTH) return false;
  if (/https?:\/\//i.test(trimmed)) return false;
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(trimmed)) return false;
  return true;
}

/**
 * 可选依赖：LLM 端口必须满足 SalesAnglePort 契约（仅措辞，禁止改写事实）。
 * 单一签名（取消 overload），从类型层面消除 overload 与实现不兼容（TS2394）。
 */
export interface SalesRecommendationDeps {
  llm?: SalesAnglePort;
  timeoutMs?: number;
}

export async function buildSalesRecommendation(
  input: SalesRecommendationInput,
  deps?: SalesRecommendationDeps,
): Promise<SalesRecommendation> {
  const baseline = buildSalesRecommendationRules(input);
  const llm = deps?.llm;
  if (!llm || baseline.status !== 'OK') return baseline;

  const timeoutMs = deps?.timeoutMs ?? 3000;
  const facts = [
    `readiness=${baseline.reasoning[0]}`,
    `buying=${input.buying.tier}/${input.buying.score}`,
    `pain=${input.pain.painScore}`,
  ];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('llm_timeout')), timeoutMs);
    });
    const suggested = await Promise.race([
      llm.suggestAngle({
        url: input.url,
        state: input.readiness.state,
        priority: baseline.priority,
        facts,
        baselineAngle: baseline.angle,
      }),
      timeout,
    ]);
    if (!isAcceptableAngle(suggested)) {
      return { ...baseline, fallbackUsed: true, reasoning: [...baseline.reasoning, 'llm_output_rejected: fallback to deterministic angle'] };
    }
    return {
      ...baseline,
      angle: suggested.trim(),
      generatedBy: 'LLM',
      reasoning: [...baseline.reasoning, 'llm_angle_applied: wording only (facts, priority and channel unchanged)'],
    };
  } catch (error) {
    const kind = error instanceof Error ? error.message : String(error);
    return {
      ...baseline,
      fallbackUsed: true,
      generatedBy: 'RULES',
      reasoning: [...baseline.reasoning, `llm_unavailable(${kind}): deterministic fallback used`],
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
