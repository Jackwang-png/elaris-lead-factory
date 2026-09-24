import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntentService } from './intent.service';
import { AiProviderRegistry } from '../providers/ai-provider.registry';

/**
 * P0-5B.1: mechanical migration — the bare OpenAI client is replaced by the
 * provider registry (business code must not construct SDK clients).
 * System prompt / extraction logic / JSON.parse fallback are UNCHANGED.
 * NOTE: this service is dead code (PipelineModule is never imported; no
 * runtime reference) — it is preserved as-is, NOT revived (report §19).
 */
@Injectable()
export class LeadService {
  constructor(
    private prisma: PrismaService,
    private intentService: IntentService,
    private readonly registry: AiProviderRegistry,
  ) {}

  async saveLead(
    bot: any,
    conversationId: string,
    message: string,
    answer: string,
    tenantId: string
  ) {
    // Quick check: if message contains no buying-related keywords, skip lead creation
    const quickWords = [
      '购买', '价格', '多少钱', '联系', '体验',
      '合作', '报价', '方案', '下单', '订购',
      '询价', '预算', 'demo', 'trial', '试用',
      '演示', '签约', '合同', '付款', '支付',
      '发票', '订单', '买', '微信'
    ];

    const hasQuickMatch = quickWords.some(w => message.includes(w));
    if (!hasQuickMatch) {
      return;
    }

    // Extract customer info (existing logic)
    let customerInfo: any = {};
    try {
      const extract = await this.registry.getDefault().chat({
        model: bot.model,
        messages: [
          {
            role: 'system',
            content: `你是销售线索提取助手。

只返回JSON。

格式:

{
"name":"",
"company":"",
"industry":"",
"platform":"",
"phone":"",
"wechat":"",
"email":"",
"interests": [],
"preferences": {},
"purchaseHistory": [],
"tags": [],
"buyingStage": "",
"budget": "",
"urgency": ""
}

interests: 客户感兴趣的产品或服务列表，例如 ["智能客服", "CRM系统"]。如果没有明确兴趣，返回空数组。

preferences: 客户偏好，例如 {"price_range": "10万-50万", "features": ["自动化", "数据分析"]}。如果没有明确偏好，返回空对象。

purchaseHistory: 客户购买历史记录，例如 [{"product": "智能客服系统", "date": "2023-01-15", "amount": 50000}]。如果没有明确购买历史，返回空数组。

tags: 客户标签列表，例如 ["高意向", "大客户", "新客户"]。根据客户消息内容自动生成标签。如果没有明确标签，返回空数组。

buyingStage: 客户购买阶段，可选值： "awareness"（认知阶段）, "consideration"（考虑阶段）, "decision"（决策阶段）, "purchase"（购买阶段）, "retention"（留存阶段）。根据客户消息内容判断。如果没有明确阶段，返回空字符串。

budget: 客户预算，例如 "10万-50万" 或 "50万以上"。如果没有明确预算，返回空字符串。

urgency: 客户紧急程度，可选值： "low"（低）, "medium"（中）, "high"（高）, "urgent"（紧急）。根据客户消息内容判断。如果没有明确紧急程度，返回空字符串。

没有的信息返回空字符串。`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      customerInfo = JSON.parse(extract.data || '{}');
    } catch (e) {
      // If AI call fails, fall back to simple extraction
      customerInfo = this.simpleExtract(message);
    }

    // Detect buying intent using the bot's model
    const intentResult = this.intentService.analyze(message);

    // Normalize intent score and level
    intentResult.score =
      intentResult.score ?? Math.round(intentResult.confidence * 100);

    intentResult.level =
      intentResult.score >= 80
        ? 'hot'
        : intentResult.score >= 50
          ? 'warm'
          : 'cold';

    // Detect purchase intention
    const hasPurchaseIntention = await this.intentService.detectPurchaseIntention(message, bot.model);

    // Detect buying intention
    const hasBuyingIntention = await this.intentService.detectBuyingIntention(message, bot.model);

    // Detect complaint
    const isComplaint = await this.intentService.detectComplaint(message, bot.model);

    // Detect after-sales support
    const isAfterSalesSupport = await this.intentService.detectAfterSalesSupport(message, bot.model);

    // Detect comparison shopping
    const isComparisonShopping = await this.intentService.detectComparisonShopping(message, bot.model);

    // Detect unclear message
    const isUnclear = await this.intentService.detectUnclear(message, bot.model);

    // Classify the intent category
    const intentCategory = await this.intentService.classifyIntent(message, bot.model);

    // Determine high purchase intent
    const highPurchaseIntent = (intentResult.score >= 80) ||
      (intentResult.level === 'hot' && hasPurchaseIntention) ||
      (intentCategory.intent === 'purchase_intent' && hasBuyingIntention);

    // Automatically detect if this is a potential customer
    const isPotentialCustomer = this.detectPotentialCustomer(
      intentResult,
      hasPurchaseIntention,
      hasBuyingIntention,
      isComplaint,
      isAfterSalesSupport,
      isComparisonShopping,
      isUnclear,
      intentCategory,
      customerInfo
    );

    let existingLead: any = null;

    // 1. Company match
    if (customerInfo.company) {
      existingLead = await this.prisma.lead.findFirst({
        where: {
          tenantId,
          botId: bot.id,
          company: customerInfo.company
        }
      });
    }

    // 2. WeChat match
    if (!existingLead && customerInfo.wechat) {
      existingLead = await this.prisma.lead.findFirst({
        where: {
          tenantId,
          botId: bot.id,
          wechat: customerInfo.wechat
        }
      });
    }

    const newContent = `--- 客户消息 ---
${message}

--- AI回复 ---
${answer}
`;

    // Create customer profile summary
    const profile = this.createCustomerProfile(customerInfo,{score:intentResult.score??0,level:intentResult.level??"cold"});

    if (existingLead) {
      await this.prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          conversationId: conversationId,
          name: customerInfo.name || existingLead.name,
          industry: customerInfo.industry || existingLead.industry,
          platform: customerInfo.platform || existingLead.platform,
          phone: customerInfo.phone || existingLead.phone,
          wechat: customerInfo.wechat || existingLead.wechat,
          email: customerInfo.email || existingLead.email,
          interests: customerInfo.interests || existingLead.interests,
          preferences: customerInfo.preferences || existingLead.preferences,
          purchaseHistory: customerInfo.purchaseHistory || existingLead.purchaseHistory,
          tags: customerInfo.tags || existingLead.tags,
          buyingStage: customerInfo.buyingStage || existingLead.buyingStage,
          budget: customerInfo.budget || existingLead.budget,
          urgency: customerInfo.urgency || existingLead.urgency,
          intentScore: intentResult.score,
          intentLevel: intentResult.level,
          remark: profile,
          lastContactAt: new Date()
        },
      });
    } else {
      await this.prisma.lead.create({
        data: {
          tenantId,
          botId: bot.id,
          conversationId: conversationId,
          name: customerInfo.name || null,
          company: customerInfo.company || null,
          industry: customerInfo.industry || null,
          platform: customerInfo.platform || null,
          phone: customerInfo.phone || null,
          wechat: customerInfo.wechat || null,
          email: customerInfo.email || null,
          interests: customerInfo.interests || [],
          preferences: customerInfo.preferences || {},
          purchaseHistory: customerInfo.purchaseHistory || [],
          tags: customerInfo.tags || [],
          buyingStage: customerInfo.buyingStage || null,
          budget: customerInfo.budget || null,
          urgency: customerInfo.urgency || null,
          source: 'ai',
          intentScore: intentResult.score,
          intentLevel: intentResult.level,
          salesStatus: 'new',
          remark: profile,
          lastContactAt: new Date()
        },
      });
    }
  }

  /**
   * Automatically detect if a customer is a potential customer.
   * Returns true if the customer is likely to be a potential customer.
   */
  private detectPotentialCustomer(
    intent: {
      score?: number;
      level?: string;
    },
    hasPurchaseIntention: boolean,
    hasBuyingIntention: boolean,
    isComplaint: boolean,
    isAfterSalesSupport: boolean,
    isComparisonShopping: boolean,
    isUnclear: boolean,
    intentCategory: {
      intent: string;
      confidence: number;
      keywords: string[];
      score?: number;
      level?: string;
    },
    customerInfo: any
  ): boolean {
    // If the message is unclear, it's not a potential customer
    if (isUnclear) {
      return false;
    }

    // If the message is a complaint, it's not a potential customer
    if (isComplaint) {
      return false;
    }

    // If the message is about after-sales support, it's not a potential customer
    if (isAfterSalesSupport) {
      return false;
    }

    // If the customer has high buying intent, they are a potential customer
    if ((intent.score ?? 0) >= 60 || intent.level === 'hot') {
      return true;
    }

    // If the customer has purchase intention, they are a potential customer
    if (hasPurchaseIntention) {
      return true;
    }

    // If the customer has buying intention, they are a potential customer
    if (hasBuyingIntention) {
      return true;
    }

    // If the customer is comparing products, they are a potential customer
    if (isComparisonShopping) {
      return true;
    }

    // If the intent category is purchase_intent or price_inquiry, they are a potential customer
    if (intentCategory.intent === 'purchase_intent' || intentCategory.intent === 'price_inquiry') {
      return true;
    }

    // If the customer provided contact information, they are a potential customer
    if (customerInfo.phone || customerInfo.wechat || customerInfo.email) {
      return true;
    }

    // If the customer has interests, they are a potential customer
    if (customerInfo.interests && customerInfo.interests.length > 0) {
      return true;
    }

    // If the customer has a budget, they are a potential customer
    if (customerInfo.budget) {
      return true;
    }

    // If the customer has urgency, they are a potential customer
    if (customerInfo.urgency) {
      return true;
    }

    // Default: not a potential customer
    return false;
  }

  /**
   * Create a customer profile summary from extracted info.
   */
  private createCustomerProfile(customerInfo: any, intent: { score: number; level: string }): string {
    let profile = '客户画像：\n\n';

    if (customerInfo.name) {
      profile += `姓名: ${customerInfo.name}\n`;
    }
    if (customerInfo.company) {
      profile += `公司: ${customerInfo.company}\n`;
    }
    if (customerInfo.industry) {
      profile += `行业: ${customerInfo.industry}\n`;
    }
    if (customerInfo.platform) {
      profile += `平台: ${customerInfo.platform}\n`;
    }
    if (customerInfo.phone) {
      profile += `电话: ${customerInfo.phone}\n`;
    }
    if (customerInfo.wechat) {
      profile += `微信: ${customerInfo.wechat}\n`;
    }
    if (customerInfo.email) {
      profile += `邮箱: ${customerInfo.email}\n`;
    }
    if (customerInfo.interests && customerInfo.interests.length > 0) {
      profile += `兴趣: ${customerInfo.interests.join(', ')}\n`;
    }
    if (customerInfo.preferences && Object.keys(customerInfo.preferences).length > 0) {
      profile += `偏好: ${JSON.stringify(customerInfo.preferences)}\n`;
    }
    if (customerInfo.purchaseHistory && customerInfo.purchaseHistory.length > 0) {
      profile += `购买历史: ${JSON.stringify(customerInfo.purchaseHistory)}\n`;
    }
    if (customerInfo.tags && customerInfo.tags.length > 0) {
      profile += `标签: ${customerInfo.tags.join(', ')}\n`;
    }
    if (customerInfo.buyingStage) {
      profile += `购买阶段: ${customerInfo.buyingStage}\n`;
    }
    if (customerInfo.budget) {
      profile += `预算: ${customerInfo.budget}\n`;
    }
    if (customerInfo.urgency) {
      profile += `紧急程度: ${customerInfo.urgency}\n`;
    }
    profile += `意向分数: ${intent.score}\n`;
    profile += `意向级别: ${intent.level}\n`;

    return profile;
  }

  /**
   * Simple extraction fallback using regex patterns.
   */
  private simpleExtract(message: string): any {
    const result: any = {};

    // Extract phone number (Chinese mobile)
    const phoneMatch = message.match(/1[3-9]\d{9}/);
    if (phoneMatch) {
      result.phone = phoneMatch[0];
    }

    // Extract phone number with country code (e.g., +86 13800138000)
    const phoneWithCodeMatch = message.match(/\+\d{1,3}\s?\d{7,15}/);
    if (phoneWithCodeMatch) {
      result.phone = phoneWithCodeMatch[0];
    }

    // Extract WeChat ID (alphanumeric, 6-20 chars, may start with "wxid_" or "wechat:")
    const wechatMatch = message.match(/(?:wxid_|wechat:)?[a-zA-Z0-9_]{6,20}/);
    if (wechatMatch) {
      result.wechat = wechatMatch[0];
    }

    // Extract email
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0];
    }

    // Extract company name (simple heuristic: words after "公司" or "企业")
    const companyMatch = message.match(/([\u4e00-\u9fa5]{2,10})(公司|企业)/);
    if (companyMatch) {
      result.company = companyMatch[0];
    }

    // Extract name (simple heuristic: words after "我叫" or "我是")
    const nameMatch = message.match(/(?:我叫|我是)([\u4e00-\u9fa5]{2,4})/);
    if (nameMatch) {
      result.name = nameMatch[1];
    }

    // Extract interests (simple heuristic: words after "感兴趣" or "想了解")
    const interestsMatch = message.match(/(?:感兴趣|想了解|需要)([\u4e00-\u9fa5\w]+)/);
    if (interestsMatch) {
      result.interests = [interestsMatch[1]];
    } else {
      result.interests = [];
    }

    // Extract preferences (simple heuristic: look for price range or feature keywords)
    const priceMatch = message.match(/(\d+[万千万亿]?)\s*[-到至]\s*(\d+[万千万亿]?)/);
    if (priceMatch) {
      result.preferences = { price_range: `${priceMatch[1]}-${priceMatch[2]}` };
    } else {
      result.preferences = {};
    }

    // Extract purchase history (simple heuristic: look for "购买过" or "买过")
    const purchaseMatch = message.match(/(?:购买过|买过|之前买过)([\u4e00-\u9fa5\w]+)/);
    if (purchaseMatch) {
      result.purchaseHistory = [{ product: purchaseMatch[1], date: '', amount: 0 }];
    } else {
      result.purchaseHistory = [];
    }

    // Extract tags (simple heuristic: look for keywords that indicate customer type)
    const tags: string[] = [];
    if (message.includes('大客户') || message.includes('集团') || message.includes('连锁')) {
      tags.push('大客户');
    }
    if (message.includes('新客户') || message.includes('第一次') || message.includes('初次')) {
      tags.push('新客户');
    }
    if (message.includes('紧急') || message.includes('急需') || message.includes('马上')) {
      tags.push('紧急');
    }
    if (message.includes('预算') || message.includes('价格') || message.includes('多少钱')) {
      tags.push('询价');
    }
    result.tags = tags;

    // Extract buying stage (simple heuristic)
    if (message.includes('了解') || message.includes('是什么') || message.includes('介绍')) {
      result.buyingStage = 'awareness';
    } else if (message.includes('比较') || message.includes('对比') || message.includes('哪个好')) {
      result.buyingStage = 'consideration';
    } else if (message.includes('决定') || message.includes('选择') || message.includes('推荐')) {
      result.buyingStage = 'decision';
    } else if (message.includes('购买') || message.includes('下单') || message.includes('订购')) {
      result.buyingStage = 'purchase';
    } else if (message.includes('售后') || message.includes('续费') || message.includes('升级')) {
      result.buyingStage = 'retention';
    } else {
      result.buyingStage = '';
    }

    // Extract budget (simple heuristic: look for price range or budget keywords)
    const budgetMatch = message.match(/(\d+[万千万亿]?)\s*[-到至]\s*(\d+[万千万亿]?)/);
    if (budgetMatch) {
      result.budget = `${budgetMatch[1]}-${budgetMatch[2]}`;
    } else {
      const singleBudgetMatch = message.match(/(\d+[万千万亿]?)\s*(?:预算|以内|左右|以上|以下)/);
      if (singleBudgetMatch) {
        result.budget = singleBudgetMatch[1];
      } else {
        result.budget = '';
      }
    }

    // Extract urgency (simple heuristic: look for urgency keywords)
    if (message.includes('紧急') || message.includes('急需') || message.includes('马上') || message.includes('立刻')) {
      result.urgency = 'urgent';
    } else if (message.includes('尽快') || message.includes('尽快') || message.includes('着急')) {
      result.urgency = 'high';
    } else if (message.includes('最近') || message.includes('近期') || message.includes('打算')) {
      result.urgency = 'medium';
    } else {
      result.urgency = '';
    }

    return result;
  }
}
