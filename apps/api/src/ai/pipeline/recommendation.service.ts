import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../../products/products.service';
import { CustomerMemoryService } from './customer-memory.service';
import { LeadScoreService } from './lead-score.service';
import { IntentResult } from './intent.service';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private productsService: ProductsService,
    private customerMemoryService: CustomerMemoryService,
    private leadScoreService: LeadScoreService,
  ) {}

  async generateRecommendations(
    customerId: string,
    tenantId: string,
    botId: string,
    intent: IntentResult,
    memories: any[],
  ): Promise<{ products: any[] }> {
    // Simple recommendation logic - placeholder implementation
    const recommendations = [
      {
        id: '1',
        name: 'Recommended Product',
        price: 99.99,
        reason: 'Based on your interest in ' + intent.intent,
        score: 80,
      },
    ];

    return { products: recommendations };
  }

  private extractCustomerPreferences(memories: any[]) {
    if (!memories || memories.length === 0) {
      return null;
    }

    const preferences: Record<string, any> = {};

    for (const memory of memories) {
      if (memory.memory) {
        for (const [key, value] of Object.entries(memory.memory)) {
          if (key !== 'interests' && key !== 'purchaseHistory') {
            preferences[key] = value;
          }
        }
      }
    }

    return Object.keys(preferences).length > 0 ? preferences : null;
  }

  private calculateProductScore(
    product: any,
    preferences: Record<string, any> | null,
    intent: IntentResult,
  ): number {
    let score = 0;

    // Score based on intent keywords
    if (intent.keywords) {
      for (const keyword of intent.keywords) {
        if (
          product.name.includes(keyword) ||
          (product.description && product.description.includes(keyword))
        ) {
          score += 10;
        }
      }
    }

    // Score based on customer preferences
    if (preferences) {
      for (const [key, value] of Object.entries(preferences)) {
        if (product[key] === value) {
          score += 5;
        }
      }
    }

    // Intent-based scoring
    switch (intent.intent) {
      case 'price_inquiry':
        score += 10;
        break;
      case 'product_inquiry':
        score += 15;
        break;
      case 'purchase_intent':
        score += 25;
        break;
    }

    return Math.min(score, 100);
  }

  private generateRecommendationReason(intent: IntentResult, product: any) {
    if (intent.intent === 'product_inquiry') {
      return `This product matches your inquiry about ${intent.keywords.join(', ')}`;
    } else if (intent.intent === 'price_inquiry') {
      return `This product offers great value for its price point`;
    } else {
      return `This product is highly recommended based on your interests`;
    }
  }

  private async saveRecommendations(
    customerId: string,
    tenantId: string,
    recommendations: any[],
  ) {
    // Recommendation model doesn't exist in Prisma schema
    // This is a placeholder implementation
    this.logger.log(`Would save recommendations for customer ${customerId}`);
  }

  async getRecommendations(customerId: string) {
    // Return placeholder recommendations
    return [
      {
        id: '1',
        name: 'Sample Product',
        price: 99.99,
        reason: 'Recommended for you',
      },
    ];
  }
}
