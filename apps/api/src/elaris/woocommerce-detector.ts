import { ParsedHtml } from './html-parser';
import { ELARIS_CONSTANTS } from './elaris.constants';

export type DetectionStrength = 'STRONG' | 'WEAK' | 'NONE';
export interface DetectionSignal { type: string; strength: 'STRONG' | 'WEAK'; evidence: string; observed: boolean; }
export interface WooCommerceDetection {
  isWooCommerce: boolean;
  confidence: DetectionStrength;
  signals: DetectionSignal[];
  strongSignals: string[];
  weakSignals: string[];
}

const STRONG_PATTERNS = [
  { type: 'wc_rest_api', re: /\/wp-json\/wc\/v\d+/i, evidence: 'WooCommerce REST API endpoint (/wp-json/wc/vN) present' },
  { type: 'wc_ajax', re: /wc-ajax=|wc-api|\/wc-api\//i, evidence: 'WooCommerce AJAX endpoint referenced' },
  { type: 'wc_class', re: /\bwoocommerce\b|\bwc-(?:product|cart|shop|account|widget)/i, evidence: 'WooCommerce CSS class present in markup' },
];
const STRONG_PATH_PATTERNS = [{ type: 'wc_cart_path', re: /\/(cart|checkout|my-account|shop|product)\b/i, evidence: 'WooCommerce-style commerce path present' }];

export function detectWooCommerce(parsed: ParsedHtml): WooCommerceDetection {
  const signals: DetectionSignal[] = [];
  const haystack = [...parsed.links, ...parsed.scripts, parsed.raw].join('\n');

  for (const p of STRONG_PATTERNS) {
    if (p.type === 'wc_class') {
      if (parsed.classes.some((c) => /^(woocommerce|wc-(product|cart|shop|account|widget))/i.test(c)))
        signals.push({ type: p.type, strength: 'STRONG', evidence: p.evidence, observed: true });
      continue;
    }
    if (p.re.test(haystack)) signals.push({ type: p.type, strength: 'STRONG', evidence: p.evidence, observed: true });
  }
  for (const link of parsed.links)
    for (const p of STRONG_PATH_PATTERNS)
      if (p.re.test(link)) signals.push({ type: p.type, strength: 'STRONG', evidence: `path: ${link}`, observed: true });

  const text = (parsed.textSnippet + ' ' + parsed.classes.join(' ')).toLowerCase();
  for (const kw of ELARIS_CONSTANTS.WEAK_SIGNAL_KEYWORDS.payment)
    if (text.includes(kw)) signals.push({ type: 'payment_keyword', strength: 'WEAK', evidence: `payment keyword observed: "${kw}"`, observed: true });
  for (const kw of ELARIS_CONSTANTS.WEAK_SIGNAL_KEYWORDS.product)
    if (text.includes(kw)) signals.push({ type: 'product_keyword', strength: 'WEAK', evidence: `product keyword observed: "${kw}"`, observed: true });

  const strongSignals = signals.filter((s) => s.strength === 'STRONG').map((s) => s.evidence);
  const weakSignals = signals.filter((s) => s.strength === 'WEAK').map((s) => s.evidence);

  let confidence: DetectionStrength = 'NONE';
  let isWooCommerce = false;
  if (strongSignals.length >= 1) { confidence = 'STRONG'; isWooCommerce = true; }
  else if (weakSignals.length >= 2) { confidence = 'WEAK'; isWooCommerce = false; }

  return { isWooCommerce, confidence, signals, strongSignals, weakSignals };
}
