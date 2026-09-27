/**
 * HUNTER Intelligence V1.4 — shared contracts (pure, evidence-first).
 *
 * 设计约束（与 ELARIS OSS Policy / Hunter 架构约束一致）：
 * - 复用既有 Lead / qualification / crawl 输出，不引入 Company / Opportunity / 新 Runtime。
 * - 一切 evidence 必须来自真实采集内容；不得编造 quote / sourceUrl / factId。
 * - 无证据即 fail-closed（INSUFFICIENT_DATA），不得以推断伪装观测。
 * - 纯函数：无 IO、无全局状态、无随机数（LLM 仅经显式注入的可选端口）。
 */
import type { MerchantQualification } from './qualification';
import type { ElarisGrade } from './elaris.constants';

/** 信号强度：STRONG = 明确商业/交易能力；WEAK = 辅助性或间接信号。 */
export type SignalStrength = 'STRONG' | 'WEAK';

/** 证据新鲜度；UNKNOWN 表示缺少采集时间，按 fail-closed 降权处理。 */
export type Freshness = 'FRESH' | 'RECENT' | 'STALE' | 'UNKNOWN';

/** 证据来自哪一类采集片段（保证 quote 可回溯到具体来源）。 */
export type SignalSource = 'text' | 'classes' | 'links';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type BuyingTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type PainKind = 'OBSERVED' | 'INFERRED';

export type ReadinessState = 'READY_NOW' | 'READY_SOON' | 'NURTURE' | 'NOT_READY' | 'UNKNOWN';

export type RecommendationChannel = 'EMAIL' | 'CALL' | 'SITE_FORM' | 'NONE';

export type LeadPriority = 'P0' | 'P1' | 'P2' | 'P3';

/** 单条证据：必须指向真实采集片段。 */
export interface SignalEvidence {
  /** 采集页面 URL（来自 crawl 结果 finalUrl，不得由模型生成）。 */
  sourceUrl: string;
  /** 原文片段：必须是对应 segment 的字面子串（机器可校验）。 */
  quote: string;
  /** quote 在所属 segment 内的起始字符偏移（0-based），用于校验 quote 真实性。 */
  start: number;
  /** quote 结束偏移（不含）：满足 value.slice(start, end) === quote。 */
  end: number;
  /** 证据所属片段类型。 */
  source: SignalSource;
  /** 若上游已分配 observed fact id，则携带以保证端到端可回溯。 */
  factId?: string;
}

/** 采集观测输入（纯数据，函数不读取任何外部状态）。 */
export interface HunterObservations {
  url: string;
  /** 页面可见文本（crawl + parse 产物）。 */
  text: string;
  /** 页面 class 集合（markup 证据）。 */
  classes?: string[];
  /** 页面链接集合（markup 证据）。 */
  links?: string[];
  /** 采集时间；缺失即 freshness=UNKNOWN，不得推断。 */
  observedAt?: string | Date | null;
  /** freshness 判定基准时间；默认当前时间。 */
  referenceTime?: string | Date | null;
  /** 上游信号 id -> observed factId 映射（可选，用于证据链回溯）。 */
  factIds?: Record<string, string>;
}

/* ------------------------------ buying signals ------------------------------ */

export type BuyingCategory = 'commerce' | 'intent' | 'capability' | 'timing';

export interface BuyingSignal {
  id: string;
  label: string;
  category: BuyingCategory;
  strength: SignalStrength;
  /** 规则基础权重。 */
  baseWeight: number;
  /** 经 freshness 衰减后的实际权重。 */
  effectiveWeight: number;
  freshness: Freshness;
  /** 非空且逐条可回溯；观测型信号 observed 恒为 true。 */
  observed: true;
  evidence: SignalEvidence[];
}

export interface BuyingSignalsResult {
  status: 'OK' | 'INSUFFICIENT_DATA';
  signals: BuyingSignal[];
  /** 0..100 聚合分（effectiveWeight 求和后截顶）。 */
  score: number;
  tier: BuyingTier;
  /** 证据覆盖率 = 命中规则数 / 规则总数。 */
  confidence: number;
  coverage: { detected: number; expected: number };
  freshness: Freshness;
  /** 存在“命中关键词但无法取证”的候选而被丢弃。 */
  evidenceMissing: boolean;
  droppedCandidates: string[];
  reasons: string[];
  notes: string[];
}

/* ------------------------------- pain signals ------------------------------- */

export interface PainSignal {
  id: string;
  label: string;
  kind: PainKind;
  severity: ConfidenceLevel;
  confidence: ConfidenceLevel;
  weight: number;
  /** INFERRED 信号必须携带 derivedFrom（观测信号 id 列表），否则不得输出。 */
  derivedFrom: string[];
  evidence: SignalEvidence[];
}

export interface PainSignalsResult {
  status: 'OK' | 'INSUFFICIENT_DATA';
  observed: PainSignal[];
  inferred: PainSignal[];
  all: PainSignal[];
  /** 0..100 痛点压力分（观测权重求和；推断信号按 50% 计入并标注）。 */
  painScore: number;
  confidence: number;
  coverage: { detected: number; expected: number };
  freshness: Freshness;
  evidenceMissing: boolean;
  droppedCandidates: string[];
  reasons: string[];
  notes: string[];
}

/* ------------------------------ sales readiness ----------------------------- */

export interface SalesReadinessInput {
  qualification?: MerchantQualification | null;
  buying: BuyingSignalsResult;
  pain: PainSignalsResult;
}

export interface SalesReadinessResult {
  status: 'OK' | 'INSUFFICIENT_DATA';
  state: ReadinessState;
  score: number;
  confidence: number;
  components: { qualification: number; buying: number; pain: number; adjustments: number };
  reasons: string[];
  blockers: string[];
  uncertainty: string[];
  recommendedAction: string;
}

/* ---------------------------- sales recommendation --------------------------- */

export interface SalesRecommendationInput {
  url?: string;
  qualification?: MerchantQualification | null;
  buying: BuyingSignalsResult;
  pain: PainSignalsResult;
  readiness: SalesReadinessResult;
}

/**
 * 可选 LLM 端口：仅允许做“语义措辞”（angle 文本润色），
 * 不得改写分数 / 优先级 / 状态等确定性事实。
 */
export interface SalesAnglePort {
  suggestAngle(args: {
    url?: string;
    state: ReadinessState;
    priority: LeadPriority;
    /** 只读事实清单（禁止 LLM 增加事实）。 */
    facts: string[];
    baselineAngle: string;
  }): Promise<string>;
}

export interface SalesRecommendation {
  status: 'OK' | 'NO_RECOMMENDATION';
  generatedBy: 'RULES' | 'LLM';
  fallbackUsed: boolean;
  angle: string;
  nextAction: string;
  whyNow: string[];
  channel: RecommendationChannel;
  priority: LeadPriority;
  reasoning: string[];
  /** 支撑推荐的证据引用（signal id / evidence quote）。 */
  evidenceRefs: string[];
}

/* ------------------------------ composite view ------------------------------ */

export interface HunterAssessment {
  url: string;
  buying: BuyingSignalsResult;
  pain: PainSignalsResult;
  readiness: SalesReadinessResult;
  recommendation: SalesRecommendation;
}

export type { MerchantQualification, ElarisGrade };
