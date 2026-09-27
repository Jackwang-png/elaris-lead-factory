/**
 * HUNTER Intelligence V1.4 — 组合入口（纯函数，不触碰既有 Runtime / Service 行为）。
 *
 * 用途：把 crawl/parse/qualification 的既有产物一次性映射为四项能力结果，
 * 供上层（如 ElarisService 或 API 层）在需要时显式调用，不改变既有调用链语义。
 */
import { buyingSignalsFromParsed, extractBuyingSignals } from './buying-signals';
import { extractPainSignals } from './pain-signals';
import { computeSalesReadiness } from './sales-readiness';
import { buildSalesRecommendationRules } from './sales-recommendation';
import type { ParsedHtml } from './html-parser';
import type { MerchantQualification } from './qualification';
import type { HunterAssessment, HunterObservations } from './hunter.types';

export interface HunterAssessmentInput {
  url: string;
  /** 已有解析产物（优先使用，保持与既有 intelligence 一致）。 */
  parsed?: ParsedHtml | null;
  /** 无 parsed 时的原始观测片段。 */
  text?: string;
  classes?: string[];
  links?: string[];
  observedAt?: string | Date | null;
  referenceTime?: string | Date | null;
  /** 既有资格门禁结果（REJECTED 将直接短路为 NOT_READY）。 */
  qualification?: MerchantQualification | null;
  /** 上游 signal id -> observed factId 映射。 */
  factIds?: Record<string, string>;
}

export function buildHunterAssessment(input: HunterAssessmentInput): HunterAssessment {
  const buying = input.parsed
    ? buyingSignalsFromParsed(input.parsed, input.url, input.observedAt, input.referenceTime, input.factIds)
    : extractBuyingSignals({
        url: input.url,
        text: input.text ?? '',
        classes: input.classes ?? [],
        links: input.links ?? [],
        observedAt: input.observedAt,
        referenceTime: input.referenceTime,
        factIds: input.factIds,
      });

  const observations: HunterObservations = {
    url: input.url,
    text: input.text ?? [input.parsed?.title, input.parsed?.metaDescription, input.parsed?.textSnippet]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' '),
    classes: input.classes ?? input.parsed?.classes ?? [],
    links: input.links ?? input.parsed?.links ?? [],
    observedAt: input.observedAt,
    referenceTime: input.referenceTime,
    factIds: input.factIds,
  };

  const pain = extractPainSignals(observations);
  const readiness = computeSalesReadiness({ qualification: input.qualification ?? null, buying, pain });
  const recommendation = buildSalesRecommendationRules({
    url: input.url,
    qualification: input.qualification ?? null,
    buying,
    pain,
    readiness,
  });

  return { url: input.url, buying, pain, readiness, recommendation };
}
