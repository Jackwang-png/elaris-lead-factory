import { Injectable } from '@nestjs/common';
import { Customer } from '@prisma/client';
import { IntentResult } from './intent.service';

export interface SalesStrategyResult {
  nextAction: string;
  responseStyle: string;
  recommendedApproach: string;
  channelSpecific?: {
    [channel: string]: {
      messageFormat?: string;
      featuresToHighlight?: string[];
      callToAction?: string;
    };
  };
}

@Injectable()
export class SalesStrategyService {
  determineStrategy(
    intent: IntentResult,
    customer: Customer | null,
    memories: any[],
    channel?: string,
  ): SalesStrategyResult {
    const strategy: SalesStrategyResult = {
      nextAction: 'respond',
      responseStyle: 'friendly',
      recommendedApproach: 'provide_information',
    };

    // Adjust strategy based on intent
    switch (intent.intent) {
      case 'product_inquiry':
        strategy.nextAction = 'provide_product_info';
        strategy.recommendedApproach = 'detailed_explanation';
        break;
      case 'price_inquiry':
        strategy.nextAction = 'provide_pricing';
        strategy.recommendedApproach = 'value_based';
        break;
      case 'comparison':
        strategy.nextAction = 'compare_products';
        strategy.recommendedApproach = 'highlight_advantages';
        break;
      case 'complaint':
        strategy.nextAction = 'resolve_issue';
        strategy.responseStyle = 'empathetic';
        strategy.recommendedApproach = 'apologize_and_solve';
        break;
      case 'after_sales':
        strategy.nextAction = 'provide_support';
        strategy.recommendedApproach = 'helpful_and_patient';
        break;
      case 'purchase_intent':
        strategy.nextAction = 'close_sale';
        strategy.recommendedApproach = 'urgency_and_benefits';
        break;
      case 'greeting':
        strategy.nextAction = 'welcome';
        strategy.recommendedApproach = 'friendly_greeting';
        break;
      case 'thanks':
        strategy.nextAction = 'acknowledge';
        strategy.recommendedApproach = 'polite_response';
        break;
      case 'goodbye':
        strategy.nextAction = 'end_conversation';
        strategy.recommendedApproach = 'friendly_goodbye';
        break;
      default:
        strategy.nextAction = 'clarify';
        strategy.recommendedApproach = 'ask_for_clarification';
    }

    // Adjust for channel
    if (channel) {
      strategy.channelSpecific = {
        [channel]: this.getChannelSpecificStrategy(intent, channel),
      };
    }

    return strategy;
  }

  private getChannelSpecificStrategy(
    intent: IntentResult,
    channel: string,
  ): {
    messageFormat?: string;
    featuresToHighlight?: string[];
    callToAction?: string;
  } {
    const result: {
      messageFormat?: string;
      featuresToHighlight?: string[];
      callToAction?: string;
    } = {};

    switch (channel) {
      case 'wechat':
        result.messageFormat = 'concise';
        if (intent.intent === 'purchase_intent') {
          result.callToAction = '点击链接完成购买';
        }
        break;
      case 'wecom':
        result.messageFormat = 'concise';
        if (intent.intent === 'purchase_intent') {
          result.callToAction = '联系我们的销售团队';
        }
        break;
      case 'taobao':
        result.messageFormat = 'short_and_direct';
        result.featuresToHighlight = ['price', 'ratings', 'delivery'];
        if (intent.intent === 'purchase_intent') {
          result.callToAction = '立即下单';
        }
        break;
      case 'webchat':
        result.messageFormat = 'detailed';
        if (intent.intent === 'comparison') {
          result.featuresToHighlight = ['features', 'benefits', 'use_cases'];
        }
        break;
      default:
        result.messageFormat = 'standard';
    }

    return result;
  }
}
