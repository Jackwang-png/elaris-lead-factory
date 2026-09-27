import { ELARIS_CONSTANTS, ElarisGrade } from './elaris.constants';
import { WooCommerceDetection } from './woocommerce-detector';

export interface MerchantQualificationInput {
  detection: WooCommerceDetection;
  signalCount: number;
  reachable: boolean;
  robotsAllowed: boolean;
  ssrfBlocked: boolean;
}
export interface MerchantQualification {
  grade: ElarisGrade;
  score: number;
  isEcommerce: boolean;
  shouldEngage: boolean;
  reasons: string[];
  observedSignals: string[];
  recommendedAction: string;
}

function rejected(reason: string, observed: string[], reasons: string[]): MerchantQualification {
  reasons.push(reason);
  return { grade: ELARIS_CONSTANTS.GRADE.REJECTED, score: 0, isEcommerce: false, shouldEngage: false, reasons, observedSignals: observed, recommendedAction: 'Do not engage: does not meet e-commerce merchant criteria.' };
}

export function qualifyMerchant(input: MerchantQualificationInput): MerchantQualification {
  const reasons: string[] = [];
  const observedSignals = [...input.detection.strongSignals, ...input.detection.weakSignals];

  if (input.ssrfBlocked) return rejected('SSRF guard blocked target host (fail-closed).', observedSignals, reasons);
  if (!input.robotsAllowed) return rejected('robots.txt disallows crawling (fail-closed).', observedSignals, reasons);
  if (!input.reachable) return rejected('Target unreachable / not fetched (fail-closed).', observedSignals, reasons);

  const strong = input.detection.strongSignals.length;
  const weak = input.detection.weakSignals.length;

  if (input.detection.confidence === 'STRONG' && strong >= 1) {
    reasons.push(`Strong WooCommerce signal(s) detected (${strong}).`);
    if (weak > 0) reasons.push(`${weak} supporting weak e-commerce signal(s).`);
    return { grade: ELARIS_CONSTANTS.GRADE.A_STRONG, score: Math.min(100, 80 + Math.min(strong, 5) * 4), isEcommerce: true, shouldEngage: true, reasons, observedSignals, recommendedAction: 'Prioritize outreach: confirmed WooCommerce merchant.' };
  }
  if (input.detection.confidence === 'WEAK' || weak >= 2) {
    reasons.push(`Weak e-commerce signal(s) detected (${weak}); WooCommerce not confirmed.`);
    return { grade: ELARIS_CONSTANTS.GRADE.B_POTENTIAL, score: Math.min(70, 45 + Math.min(weak, 5) * 5), isEcommerce: weak >= 2, shouldEngage: weak >= 2, reasons, observedSignals, recommendedAction: 'Secondary outreach: verify cart/checkout before engaging.' };
  }
  if (weak >= 1) {
    reasons.push(`Minimal e-commerce signal (${weak}).`);
    return { grade: ELARIS_CONSTANTS.GRADE.C_WEAK, score: Math.min(40, 25 + weak * 5), isEcommerce: false, shouldEngage: false, reasons, observedSignals, recommendedAction: 'Low priority: monitor only.' };
  }
  return rejected('No e-commerce signals observed.', observedSignals, reasons);
}
