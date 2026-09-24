import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntentService } from './intent.service';
import { LeadScoreService } from './lead-score.service';
import { SalesStrategyService } from './sales-strategy.service';
import { ResponseGenerationService } from './response-generation.service';
import { CustomerMemoryService } from './customer-memory.service';
import { RecommendationService } from './recommendation.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { v4 as uuidv4 } from 'uuid';

export type CustomerStage =
  | 'NEW'
  | 'DISCOVERY'
  | 'QUALIFYING'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'CLOSED';

export interface SalesConversationResult {
  response: string;
  intent: {
    intent: string;
    confidence: number;
    keywords: string[];
  };
  stage: CustomerStage;
  action: string;
  products?: Array<{
    id: string;
    name: string;
    price: number;
    reason: string;
    score: number;
  }>;
  nextAction?: string;
  metadata?: {
    leadScore?: number;
    leadLevel?: string;
    strategy?: any;
  };
}

@Injectable()
export class SalesConversationEngineService {
  constructor(
    private prisma: PrismaService,
    private intentService: IntentService,
    private leadScoreService: LeadScoreService,
    private salesStrategyService: SalesStrategyService,
    private responseGenerationService: ResponseGenerationService,
    private productsService: any, // Temporary workaround
    private customerMemoryService: CustomerMemoryService,
    private recommendationService: RecommendationService,
    private knowledgeRetrievalService: KnowledgeRetrievalService,
  ) {}

  async processMessage(
    tenantId: string,
    botId: string,
    conversationId: string,
    customerId: string,
    userMessage: string,
  ): Promise<SalesConversationResult> {
    // Use conversation model instead
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    // 2. Analyze intent
    const intentResult = await this.intentService.analyze(userMessage);

    // 3. Get customer memory
    const memory = await this.customerMemoryService.getMemoriesByCustomer(customerId, botId);
    const memoryData = {};

    // 4. Extract contact info from message
    const contactInfo = await this.customerMemoryService.extractContactInfoFromMessage(userMessage);

    // 6. Calculate lead score
    const hasContactInfo = !!(contactInfo.phone || contactInfo.email);
    const leadScore = { score: 0, level: 'cold' }; // Placeholder

    // 7. Determine sales strategy based on current stage and intent
    const strategy = {
      nextAction: 'respond',
      responseStyle: 'friendly',
      recommendedApproach: 'consultative'
    };

    // 9. Get product recommendations
    const recommendations = await this.recommendationService.generateRecommendations(
      customerId,
      tenantId,
      botId,
      intentResult,
      [],
    );

    // 10. Generate response
    const generated = this.responseGenerationService.generate(
      intentResult.intent,
      strategy,
      recommendations,
      [],
    );

    // 11. Determine next stage
    const nextStage = this.determineNextStage(
      (conversation as any)?.currentStage || 'NEW',
      intentResult.intent,
      leadScore.level,
    );

    return {
      response: generated.text,
      intent: intentResult,
      stage: nextStage,
      action: strategy.nextAction,
      products: recommendations.products,
      nextAction: strategy.nextAction,
      metadata: {
        leadScore: leadScore.score,
        leadLevel: leadScore.level,
        strategy,
      },
    };
  }

  private async updateCustomerProfile(
    tenantId: string,
    customerId: string,
    message: string,
    intentResult: any,
    contactInfo: any,
  ) {
    const updateData: any = {};

    // Update contact info if found in message
    if (contactInfo.phone) {
      updateData.phone = contactInfo.phone;
    }
    if (contactInfo.email) {
      updateData.email = contactInfo.email;
    }
    if (contactInfo.wechat) {
      updateData.wechat = contactInfo.wechat;
    }

    // Update budget if mentioned
    const budget = this.extractBudget(message);
    if (budget) {
      updateData.budget = budget;
    }

    // Update purchase timeframe if mentioned
    const purchaseTimeframe = this.extractPurchaseTimeframe(message);
    if (purchaseTimeframe) {
      updateData.purchaseTimeframe = purchaseTimeframe;
    }

    // Update decision maker status if mentioned
    const decisionMaker = this.extractDecisionMaker(message);
    if (decisionMaker !== undefined) {
      updateData.decisionMaker = decisionMaker;
    }

    // Update status based on intent
    if (intentResult.intent === 'purchase_confirmation' || intentResult.intent === 'payment_confirmation') {
      // status field doesn't exist, skip for now
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.customer.update({
        where: { id: customerId, tenantId },
        data: updateData,
      });
    }
  }

  private extractBudget(message: string): string | undefined {
    const budgetPatterns = [
      /预算[^\d]*([\d,]+)/i,
      /([\d,]+)[^\d]*元/i,
      /花费[^\d]*([\d,]+)/i,
      /价格[^\d]*([\d,]+)/i,
      /([\d,]+)\s*(元|块|人民币|RMB)/i,
      /预算范围[^\d]*([\d,]+)\s*到\s*([\d,]+)/i,
    ];

    for (const pattern of budgetPatterns) {
      const match = message.match(pattern);
      if (match) {
        if (pattern.toString().includes('到')) {
          // Range pattern
          return `${match[1]}-${match[2]}`;
        }
        return match[1].replace(/,/g, '');
      }
    }

    return undefined;
  }

  private extractPurchaseTimeframe(message: string): string | undefined {
    const timeframePatterns = [
      /(这周|本周|下周|这个月|本月|下个月|近期|最近|马上|立刻|尽快|一周|两周|三周|一个月|两个月|三个月|半年|一年|立即|即刻|现在|今天|明天|后天)/i,
      /(\d+)[^\d]*(天|周|星期|个月|年)/i,
      /(本季度|下季度|今年|明年)/i,
    ];

    for (const pattern of timeframePatterns) {
      const match = message.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return undefined;
  }

  private extractDecisionMaker(message: string): boolean | undefined {
    const decisionMakerPatterns = [
      /(决定|拍板|做主|说了算|我可以决定|我决定|我做主|我是决策人)/i,
      /(老板|领导|经理|主管|负责人|决策人)/i,
    ];

    for (const pattern of decisionMakerPatterns) {
      if (pattern.test(message)) {
        return true;
      }
    }

    return undefined;
  }

  private async getCustomerVisitCount(tenantId: string, customerId: string): Promise<number> {
    const conversations = await this.prisma.conversation.count({
      where: {
        tenantId,
        visitor: customerId,
      },
    });
    return conversations;
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      '的', '了', '在', '是', '我', '你', '他', '她', '它', '我们', '你们', '他们',
      '这', '那', '哪', '和', '与', '或', '及', '啊', '哦', '嗯', '哈', '呀',
      '什么', '怎么', '为什么', '多少', '几个', '请问', '你好', '您好', '谢谢', '感谢',
      '想', '要', '买', '购买', '需要', '有', '没有', '吗', '呢', '吧', '啊', '呀',
      '产品', '价格', '多少', '钱', '元', '块', '人民币', 'RMB', '报价', '优惠',
    ];
    return commonWords.includes(word.toLowerCase());
  }

  private determineNextStage(
    currentStage: CustomerStage,
    intent: string,
    leadLevel: string,
  ): CustomerStage {
    const stageOrder: CustomerStage[] = [
      'NEW',
      'DISCOVERY',
      'QUALIFYING',
      'PROPOSAL',
      'NEGOTIATION',
      'CLOSED',
    ];

    const currentIndex = stageOrder.indexOf(currentStage);

    // If already at CLOSED, stay there
    if (currentStage === 'CLOSED') {
      return 'CLOSED';
    }

    // Move forward based on intent and lead level
    if (intent === 'purchase_intent' || intent === 'price_negotiation') {
      if (currentIndex < stageOrder.indexOf('NEGOTIATION')) {
        return 'NEGOTIATION';
      }
    }

    if (intent === 'purchase_confirmation' || intent === 'payment_confirmation') {
      return 'CLOSED';
    }

    if (intent === 'contact_info_provided' || leadLevel === 'very_high') {
      if (currentIndex < stageOrder.indexOf('PROPOSAL')) {
        return 'PROPOSAL';
      }
    }

    if (intent === 'qualification_info' || leadLevel === 'high') {
      if (currentIndex < stageOrder.indexOf('QUALIFYING')) {
        return 'QUALIFYING';
      }
    }

    if (intent === 'product_inquiry' || intent === 'general_inquiry' || intent === 'recommendation_request') {
      if (currentIndex < stageOrder.indexOf('DISCOVERY')) {
        return 'DISCOVERY';
      }
    }

    // If we have enough info and customer is ready, move forward
    if (currentIndex < stageOrder.length - 1) {
      return stageOrder[currentIndex + 1];
    }

    // Default: stay at current stage
    return currentStage;
  }

  private async createFollowUp(
    tenantId: string,
    customerId: string,
    agentId: string,
    message: string,
  ) {
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);

    // Placeholder implementation
    console.log(`Would create follow-up for customer ${customerId}`);
  }

  async getConversationStage(conversationId: string): Promise<CustomerStage> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    return 'NEW'; // Placeholder
  }

  async updateConversationStage(
    conversationId: string,
    stage: CustomerStage,
    reason?: string,
  ): Promise<void> {
    // Placeholder implementation
    console.log(`Would update conversation ${conversationId} to stage ${stage}`);
  }

  async getConversationProducts(conversationId: string) {
    // Placeholder implementation
    return [];
  }
}
