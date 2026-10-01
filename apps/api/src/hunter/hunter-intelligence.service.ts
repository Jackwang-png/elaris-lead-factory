import { Injectable } from '@nestjs/common';

/**
 * ============================================================================
 * HunterIntelligenceService
 * ----------------------------------------------------------------------------
 * THE ONLY production importer of `elaris/**` (Hunter V1.4 brain).
 *
 * Rules enforced by this boundary:
 *  - Hunter pure functions are never re-implemented and never duplicated.
 *  - No other service/controller may import `elaris/**`.
 *  - Qualification is always computed here from observed evidence, never
 *    accepted from a caller.
 * ============================================================================
 */
import { parseHtml } from '../elaris/html-parser';
import type { ParsedHtml } from '../elaris/html-parser';
import { detectWooCommerce } from '../elaris/woocommerce-detector';
import type { WooCommerceDetection } from '../elaris/woocommerce-detector';
import { qualifyMerchant } from '../elaris/qualification';
import type {
  MerchantQualification,
  MerchantQualificationInput,
} from '../elaris/qualification';
import { buildHunterAssessment } from '../elaris/hunter.assessment';
import type { HunterAssessmentInput } from '../elaris/hunter.assessment';
import type { HunterAssessment } from '../elaris/hunter.types';

export interface QualifySignals {
  detection: WooCommerceDetection;
  signalCount: number;
  reachable: boolean;
  robotsAllowed: boolean;
  ssrfBlocked: boolean;
}

@Injectable()
export class HunterIntelligenceService {
  /** HTML -> structured observation (no persistence of raw HTML). */
  parse(html: string): ParsedHtml {
    return parseHtml(html);
  }

  /** Commerce platform detection (WooCommerce in v1). */
  detect(parsed: ParsedHtml): WooCommerceDetection {
    return detectWooCommerce(parsed);
  }

  /** Merchant qualification gate: A_STRONG / B_POTENTIAL / C_WEAK / REJECTED. */
  qualify(signals: QualifySignals): MerchantQualification {
    const input: MerchantQualificationInput = {
      detection: signals.detection,
      signalCount: signals.signalCount,
      reachable: signals.reachable,
      robotsAllowed: signals.robotsAllowed,
      ssrfBlocked: signals.ssrfBlocked,
    };
    return qualifyMerchant(input);
  }

  /** Full V1.4 assessment: buying / pain / readiness / recommendation. */
  assess(input: HunterAssessmentInput): HunterAssessment {
    return buildHunterAssessment(input);
  }
}
