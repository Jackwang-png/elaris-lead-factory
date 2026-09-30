/**
 * HUNTER Intelligence V1.4 — deterministic rule tables & weights.
 *
 * 全部为纯数据（无 IO、无副作用），便于审计与回归。
 * 规则灵感来源见 NOTICE-hunter-oss.md；本文件为 ELARIS 独立实现，未复制任何第三方代码。
 */
import type { BuyingCategory, ConfidenceLevel, SignalStrength } from './hunter.types';

export interface HunterSignalRule {
  id: string;
  label: string;
  category: BuyingCategory;
  strength: SignalStrength;
  weight: number;
  keywords: string[];
}

/** A. buying-signals —— 观测型关键词规则表（顺序即聚合顺序，保证确定性）。 */
export const HUNTER_BUYING_RULES: HunterSignalRule[] = [
  {
    id: 'distributor_intent',
    label: 'Wholesale / distribution intent stated',
    category: 'intent',
    strength: 'STRONG',
    weight: 16,
    keywords: ['wholesale', 'distributor', 'become a dealer', 'become a distributor', 'bulk order', 'b2b', 'reseller', 'oem', 'odm', 'agent program'],
  },
  {
    id: 'checkout_capability',
    label: 'Self-serve checkout capability present',
    category: 'capability',
    strength: 'STRONG',
    weight: 14,
    keywords: ['checkout', 'proceed to payment', 'pay now', 'secure payment'],
  },
  {
    id: 'cart_capability',
    label: 'Cart / basket interaction present',
    category: 'capability',
    strength: 'STRONG',
    weight: 12,
    keywords: ['add to cart', 'add to basket', 'add to bag'],
  },
  {
    id: 'commercial_intent',
    label: 'Explicit commercial purchase language',
    category: 'intent',
    strength: 'STRONG',
    weight: 12,
    keywords: ['buy now', 'order now', 'shop now', 'purchase', 'place order'],
  },
  {
    id: 'pricing_transparency',
    label: 'Public pricing / quote request surface',
    category: 'commerce',
    strength: 'STRONG',
    weight: 10,
    keywords: ['request a quote', 'get a quote', 'price list', 'pricing', 'minimum order', 'moq'],
  },
  {
    id: 'catalog_browse',
    label: 'Product catalog browsing surface',
    category: 'commerce',
    strength: 'STRONG',
    weight: 8,
    keywords: ['products', 'catalog', 'catalogue', 'online store'],
  },
  {
    id: 'promotion_activity',
    label: 'Active promotion / discount programme',
    category: 'timing',
    strength: 'WEAK',
    weight: 6,
    keywords: ['discount', 'sale', 'promo', 'promotion', 'coupon', 'free shipping', 'limited time'],
  },
  {
    id: 'contactability',
    label: 'Business contact channel published',
    category: 'capability',
    strength: 'WEAK',
    weight: 6,
    keywords: ['contact us', 'request a demo', 'book a call', 'inquiry', 'enquiry', 'contact form', 'whatsapp'],
  },
  {
    id: 'account_capability',
    label: 'Account / order-tracking portal present',
    category: 'capability',
    strength: 'WEAK',
    weight: 5,
    keywords: ['my account', 'sign in', 'order tracking', 'track order', 'register'],
  },
  {
    id: 'shipping_logistics',
    label: 'Shipping / logistics commitment stated',
    category: 'capability',
    strength: 'WEAK',
    weight: 5,
    keywords: ['shipping', 'delivery', 'freight', 'logistics', 'fulfilment', 'fulfillment'],
  },
];

/** buying 聚合分层阈值（含下界，降序匹配）。 */
export const HUNTER_BUYING_TIERS: Array<{ tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'; min: number }> = [
  { tier: 'HIGH', min: 60 },
  { tier: 'MEDIUM', min: 30 },
  { tier: 'LOW', min: 10 },
  { tier: 'NONE', min: 0 },
];

/** freshness 判定与权重衰减：UNKNOWN 不是 1，避免无时间证据时高估。 */
export const HUNTER_FRESHNESS = {
  FRESH_DAYS: 7,
  RECENT_DAYS: 30,
  DECAY: { FRESH: 1, RECENT: 0.8, STALE: 0.4, UNKNOWN: 0.6 } as Record<string, number>,
};

/**
 * 匹配层契约（buying / pain 共用同一套语义，避免两套规则各自解释）。
 *
 * - 词边界：关键字必须作为独立 token 出现，禁止裸 substring：
 *   wholesale 不得命中 sale、registered 不得命中 register、b2biz 不得命中 b2b。
 *   形态变体（catalog/catalogue、promo/promotion、sale/sales）必须在规则表中显式枚举，
 *   不允许用宽松 substring 顺带命中。
 * - 分隔符归一：关键字中的空格同时匹配空格 / 连字符 / 下划线，
 *   使 "add to cart" 可命中 markup 中的 add-to-cart / add_to_cart（结构化证据）。
 * - 否定语境：命中位置前窗口内出现否定词即视为否定证据并抑制
 *   （never out of stock / not under maintenance 不得生成 pain）；
 *   窗口内出现 only / just / merely 时取消抑制（"not only wholesale but also retail"）。
 * - 语义豁免：否定形式本身即为正向商业信号的少数关键字不做否定抑制
 *   （"no minimum order" / "no MOQ" 仍是可下单信号）。
 */
export const HUNTER_MATCHING = {
  /** 否定语境向前回溯的最大字符数。 */
  NEGATION_WINDOW: 32,
  /** 窗口内参与判定的末尾 token 数（限制误伤范围）。 */
  NEGATION_LOOKBACK_TOKENS: 3,
  /** 否定词（token 级精确匹配，规避 note / nobody 等误命中）。 */
  NEGATION_TOKENS: [
    'no', 'not', 'never', 'without', 'none', 'cannot', 'nor', 'non', 'un',
    "don't", "doesn't", "didn't", "isn't", "aren't", "won't", "can't", "hasn't", "haven't",
  ],
  /** 出现这些 token 时取消否定抑制（"not only ... but also ..." 是枚举而非否定）。 */
  NEGATION_EXEMPT_TOKENS: ['only', 'just', 'merely'],
  /** 否定形式本身即正向信号的关键字白名单（与规则表关键字一致）。 */
  NEGATION_EXEMPT_KEYWORDS: ['minimum order', 'moq'],
} as const;

/** 子句边界：否定语境不得跨越这些字符（含中英文标点）。 */
export const HUNTER_CLAUSE_BOUNDARIES = [
  '.', '!', '?', ';', ',', ':', '|', '/', '(', ')', '[', ']', '"', '\n', '\r',
  '。', '！', '？', '；', '，', '：', '、',
];

export interface HunterPainRule {
  id: string;
  label: string;
  weight: number;
  severity: ConfidenceLevel;
  keywords: string[];
}

/** B. pain-signals —— 观测型痛点规则表。 */
export const HUNTER_PAIN_OBSERVED_RULES: HunterPainRule[] = [
  {
    id: 'stockout',
    label: 'Stock-out / unavailable inventory surfaced',
    weight: 18,
    severity: 'HIGH',
    keywords: ['out of stock', 'sold out', 'backorder', 'back order', 'temporarily unavailable'],
  },
  {
    id: 'transaction_failure',
    label: 'Transaction or page failure surfaced to buyers',
    weight: 20,
    severity: 'HIGH',
    keywords: ['payment failed', 'something went wrong', 'page not found', '404 not found', 'internal server error', 'gateway error'],
  },
  {
    id: 'manual_order_process',
    label: 'Manual ordering only (no self-serve checkout)',
    weight: 16,
    severity: 'HIGH',
    keywords: ['order by email', 'order via whatsapp', 'call to order', 'contact to order', 'dm to order'],
  },
  {
    id: 'maintenance',
    label: 'Site under maintenance / construction',
    weight: 14,
    severity: 'MEDIUM',
    keywords: ['under maintenance', 'under construction', 'site is down'],
  },
  {
    id: 'performance_friction',
    label: 'Performance / responsiveness friction',
    weight: 10,
    severity: 'MEDIUM',
    keywords: ['loading slowly', 'takes too long', 'timed out', 'timeout'],
  },
  {
    id: 'prelaunch',
    label: 'Pre-launch / coming-soon state',
    weight: 8,
    severity: 'LOW',
    keywords: ['coming soon', 'launching soon', 'notify me when', 'waitlist'],
  },
];

export interface HunterPainInferenceRule {
  id: string;
  label: string;
  /** 至少命中其中一个观测信号才允许推断。 */
  requiresAny: string[];
  confidence: ConfidenceLevel;
  /** 命中观测信号 >= 2 条时提升一级置信度（封顶 HIGH）。 */
  escalateOnMultiEvidence: boolean;
  rationale: string;
}

/** B. pain-signals —— 推断规则（必须锚定观测信号，禁止凭空生成）。 */
export const HUNTER_PAIN_INFERENCE_RULES: HunterPainInferenceRule[] = [
  {
    id: 'lost_conversion_risk',
    label: '库存或交易中断可能正在抑制成交',
    requiresAny: ['stockout', 'transaction_failure'],
    confidence: 'MEDIUM',
    escalateOnMultiEvidence: true,
    rationale: '观测到库存/交易类中断，通常与转化流失同时出现。',
  },
  {
    id: 'manual_ops_overhead',
    label: '人工下单流程带来运营开销与线索流失',
    requiresAny: ['manual_order_process', 'performance_friction'],
    confidence: 'MEDIUM',
    escalateOnMultiEvidence: true,
    rationale: '缺少自助下单或响应迟缓，均指向人工处理瓶颈。',
  },
  {
    id: 'demand_validation_window',
    label: '预热期需求验证窗口',
    requiresAny: ['prelaunch'],
    confidence: 'LOW',
    escalateOnMultiEvidence: false,
    rationale: '预热页面说明需求尚未验证，适合早期触达。',
  },
];

/** C. sales-readiness —— 确定性加权。 */
export const HUNTER_READINESS = {
  /**
   * P1-4 唯一资格分来源：MerchantQualification.score（0..100）。
   * 不再维护 grade -> base score 的第二张表：同一事实只允许一处定义，
   * 原 BASE_BY_GRADE 与 qualification.score 并存导致 score 成为实际不生效字段。
   */
  QUALIFICATION_SCORE_SOURCE: 'MerchantQualification.score',
  /** 资格缺失时按 0 计入（fail-closed），不使用任何猜测基准分。 */
  MISSING_QUALIFICATION_COMPONENT: 0,
  /**
   * P1-3 唯一权重语义：score 分量与 confidence 必须使用同一组权重，
   * 不得存在“一套 score 权重 + 一套隐含 confidence 权重”。
   */
  WEIGHTS: { QUALIFICATION: 0.5, BUYING: 0.3, PAIN: 0.2 },
  /**
   * P0-1 硬门：qualification.shouldEngage === false 时一律 fail-closed 到 NOT_READY；
   * buying / pain 分数不得把该目标重新提升为 READY_SOON / READY_NOW。
   */
  HARD_GATE_BLOCKER: 'qualification_should_engage_false',
  /** 结构性加成（确定性、可审计）。 */
  ADJUSTMENTS: { DISTRIBUTOR_INTENT: 6, OBSERVED_OPERATIONAL_PAIN: 4, CAP: 10 },
  /** state 阈值（含下界，降序匹配）。 */
  STATE_THRESHOLDS: [
    { state: 'READY_NOW' as const, min: 75 },
    { state: 'READY_SOON' as const, min: 55 },
    { state: 'NURTURE' as const, min: 30 },
    { state: 'NOT_READY' as const, min: 0 },
  ],
  /** 置信度低于该值时，READY_NOW 降级为 READY_SOON（fail-closed 倾向）。 */
  MIN_CONFIDENCE: 0.5,
  ACTIONS: {
    READY_NOW: 'Engage now: assign to senior SDR within 24h and lead with observed checkout/catalog facts.',
    READY_SOON: 'Engage soon: verify cart/checkout depth before committing senior resource.',
    NURTURE: 'Nurture: keep on watch list and re-crawl for stronger commerce evidence.',
    NOT_READY: 'Do not engage: target does not meet e-commerce merchant criteria.',
    UNKNOWN: 'Do not engage yet: re-crawl the target to obtain observed evidence.',
  } as Record<string, string>,
};

/** D. sales-recommendation —— 规则模板与边界。 */
export const HUNTER_RECOMMENDATION = {
  MAX_ANGLE_LENGTH: 280,
  /** 硬门 / 资格拒绝后禁止推进：priority 固定降为最低档。 */
  BLOCKED_PRIORITY: 'P3',
  NO_RECOMMENDATION_ANGLE: '不生成推荐：当前证据不支持进入销售动作。',
  HARD_GATE_ANGLE: '不生成推荐：资格硬门未通过（shouldEngage=false），禁止推进销售动作。',
  /** 可构成 why-now 的时间性信号 id。 */
  TIMING_SIGNAL_IDS: ['promotion_activity', 'distributor_intent'],
  /** 触达渠道规则（确定性，按顺序匹配）。 */
  CHANNEL_BY_STATE: { READY_NOW: 'CALL', READY_SOON: 'EMAIL', NURTURE: 'SITE_FORM' } as Record<string, string>,
  ANGLE_BY_STATE: {
    READY_NOW: 'WooCommerce 转化与性能优化（以已观测的购物车/结账证据开场）',
    READY_SOON: '电商转化基础验证（先确认购物车与结账链路深度）',
    NURTURE: '低成本培育型内容触达（保持存在感，等待更强证据）',
  } as Record<string, string>,
  NEXT_ACTION_BY_STATE: {
    READY_NOW: 'Assign to senior SDR within 24h; open with the observed cart/checkout evidence.',
    READY_SOON: 'Send a verification-first email asking about cart/checkout scope.',
    NURTURE: 'Add to low-frequency nurture sequence; re-crawl in 14 days.',
  } as Record<string, string>,
};

export const HUNTER_LIMITS = {
  /** 每条信号最多保留的证据条数。 */
  MAX_EVIDENCE_PER_SIGNAL: 2,
  MAX_SIGNAL_SCORE: 100,
};
