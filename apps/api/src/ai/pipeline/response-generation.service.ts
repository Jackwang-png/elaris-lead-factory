import { Injectable } from '@nestjs/common';
import { SalesStrategyResult } from './sales-strategy.service';

export interface GeneratedResponse {
  text: string;
  /** 是否命中兜底话术（AI 无法回答）——用于触发转人工客服 */
  fallback: boolean;
}

@Injectable()
export class ResponseGenerationService {
  generate(
    intent: string,
    strategy: SalesStrategyResult,
    recommendations: { products: { product: any; reason: string; score: number }[] },
    knowledgeResults: any[],
    channel?: string,
  ): GeneratedResponse {
    let response = '';
    let fallback = false;

    // Get channel-specific formatting
    const channelFormat = channel ? strategy.channelSpecific?.[channel] : null;

    // Generate response based on intent and strategy
    switch (intent) {
      case 'product_inquiry':
        if (recommendations.products.length > 0) {
          const product = recommendations.products[0].product;
          response = `我们推荐${product.name}，${recommendations.products[0].reason}。`;
          if (channelFormat?.featuresToHighlight?.includes('price') && product.price) {
            response += ` 价格是${product.price}元。`;
          }
        } else if (knowledgeResults.length > 0) {
          response = knowledgeResults[0].content;
        } else {
          // 无产品、无知识命中 → 兜底
          response = '我们有多款产品可以满足您的需求，您对哪方面比较感兴趣呢？';
          fallback = true;
        }
        break;

      case 'price_inquiry':
        if (recommendations.products.length > 0) {
          const product = recommendations.products[0].product;
          response = `${product.name}的价格是${product.price || 'XXX'}元。${recommendations.products[0].reason}`;
        } else {
          response = '我们的产品价格根据型号和配置有所不同，您可以告诉我您的具体需求吗？';
        }
        break;

      case 'comparison':
        if (recommendations.products.length >= 2) {
          const product1 = recommendations.products[0].product;
          const product2 = recommendations.products[1].product;
          response = `我们推荐${product1.name}和${product2.name}。${product1.name}的优势是${recommendations.products[0].reason}，而${product2.name}的优势是${recommendations.products[1].reason}。`;
        } else {
          response = '我们有多款产品可以满足不同的需求，您能告诉我您更关注哪些方面吗？';
        }
        break;

      case 'complaint':
        response = '非常抱歉给您带来了不好的体验。我们会尽快处理您的问题，请问可以告诉我具体的情况吗？';
        break;

      case 'after_sales':
        response = '感谢您的信任。我们的售后服务包括产品保修、维修等服务，请问您需要哪方面的帮助？';
        break;

      case 'purchase_intent':
        if (recommendations.products.length > 0) {
          const product = recommendations.products[0].product;
          response = `太好了！${product.name}非常适合您。${recommendations.products[0].reason} 您可以直接下单购买。`;
          if (channelFormat?.callToAction) {
            response += ` ${channelFormat.callToAction}`;
          }
        } else {
          response = '非常感谢您的购买意向！我们的客服会尽快与您联系，为您提供更详细的信息。';
        }
        break;

      case 'greeting':
        response = '您好！很高兴为您服务，请问有什么可以帮助您的吗？';
        break;

      case 'thanks':
        response = '不客气！很高兴能帮到您，祝您有美好的一天！';
        break;

      case 'goodbye':
        response = '感谢您的咨询，再见！如果有任何问题随时欢迎联系我们。';
        break;

      default:
        if (recommendations.products.length > 0) {
          const product = recommendations.products[0].product;
          response = `根据您的需求，我们推荐${product.name}，${recommendations.products[0].reason}。`;
        } else {
          // 通用兜底：AI 无法理解/无法回答 → 转人工
          response = '您好！请问您需要了解哪方面的信息呢？';
          fallback = true;
        }
    }

    // Apply channel-specific formatting
    if (channelFormat?.messageFormat === 'concise') {
      response = this.makeConcise(response);
    } else if (channelFormat?.messageFormat === 'short_and_direct') {
      response = this.makeShortAndDirect(response);
    }

    return { text: response, fallback };
  }

  private makeConcise(response: string): string {
    // Remove unnecessary words and make it more concise
    return response.replace(/非常|很|请问|呢|吗/g, '');
  }

  private makeShortAndDirect(response: string): string {
    // Make it very short and direct
    const sentences = response.split(/[。？！]/);
    return sentences[0] || response;
  }
}
