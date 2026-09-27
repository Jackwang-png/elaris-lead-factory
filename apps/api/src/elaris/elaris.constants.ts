/**
 * ELARIS V1.4 — shared constants & default safety config.
 * Fail-closed defaults: conservative timeouts / bytes / redirects.
 */
export const ELARIS_CONSTANTS = {
  CRAWL: {
    DEFAULT_TIMEOUT_MS: 8000,
    DEFAULT_MAX_BYTES: 2_000_000,
    DEFAULT_MAX_REDIRECTS: 5,
    DEFAULT_MIN_DOMAIN_INTERVAL_MS: 1000,
    DEFAULT_USER_AGENT: 'ElarisBot/1.4 (+commerce-discovery; respectful)',
    ALLOWED_SCHEMES: ['http:', 'https:'] as const,
  },
  GRADE: {
    A_STRONG: 'A_STRONG',
    B_POTENTIAL: 'B_POTENTIAL',
    C_WEAK: 'C_WEAK',
    REJECTED: 'REJECTED',
  } as const,
  CONFIDENCE: { STRONG: 'STRONG', WEAK: 'WEAK', NONE: 'NONE' } as const,
  FACT_CLASS: {
    OBSERVED_FACT: 'OBSERVED_FACT',
    INFERENCE: 'INFERENCE',
    RECOMMENDATION: 'RECOMMENDATION',
  } as const,
  WEAK_SIGNAL_KEYWORDS: {
    payment: ['checkout', 'payment', 'pay now', 'stripe', 'paypal', 'alipay', 'wechat pay', 'weixin pay', 'credit card', 'apple pay', 'google pay', 'razorpay', 'klarna', 'shopify payments'],
    product: ['add to cart', 'add to basket', 'product', 'shop', 'store', 'buy', 'buy now', 'cart', 'catalog', 'ecommerce', 'e-commerce', 'online store', 'snipcart', 'ecwid'],
  },
  LEAD_PRIORITY: { A_STRONG: 'P0', B_POTENTIAL: 'P1', C_WEAK: 'P2', REJECTED: 'P3' } as const,
};

export type ElarisGrade = typeof ELARIS_CONSTANTS.GRADE[keyof typeof ELARIS_CONSTANTS.GRADE];
export type ElarisConfidence = typeof ELARIS_CONSTANTS.CONFIDENCE[keyof typeof ELARIS_CONSTANTS.CONFIDENCE];
export type ElarisFactClass = typeof ELARIS_CONSTANTS.FACT_CLASS[keyof typeof ELARIS_CONSTANTS.FACT_CLASS];

export interface ElarisCrawlConfig {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  minDomainIntervalMs: number;
  userAgent: string;
  robotsUserAgent: string;
}

export const DEFAULT_ELARIS_CRAWL_CONFIG: ElarisCrawlConfig = {
  timeoutMs: ELARIS_CONSTANTS.CRAWL.DEFAULT_TIMEOUT_MS,
  maxBytes: ELARIS_CONSTANTS.CRAWL.DEFAULT_MAX_BYTES,
  maxRedirects: ELARIS_CONSTANTS.CRAWL.DEFAULT_MAX_REDIRECTS,
  minDomainIntervalMs: ELARIS_CONSTANTS.CRAWL.DEFAULT_MIN_DOMAIN_INTERVAL_MS,
  userAgent: ELARIS_CONSTANTS.CRAWL.DEFAULT_USER_AGENT,
  robotsUserAgent: 'ElarisBot',
};
