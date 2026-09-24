import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IntentResult } from './intent.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LeadScoreService {
  constructor(private prisma: PrismaService) {}

  async updateLeadScore(customerId: string, intent: IntentResult, tenantId: string) {
    // Calculate score based on intent
    let scoreChange = 0;
    let level = 'cold';

    switch (intent.intent) {
      case 'purchase_intent':
        scoreChange = 30;
        level = 'hot';
        break;
      case 'product_inquiry':
        scoreChange = 15;
        level = 'warm';
        break;
      case 'price_inquiry':
        scoreChange = 20;
        level = 'warm';
        break;
      case 'comparison':
        scoreChange = 10;
        level = 'warm';
        break;
      case 'complaint':
        scoreChange = -10;
        level = 'cold';
        break;
      case 'after_sales':
        scoreChange = 5;
        level = 'warm';
        break;
      case 'greeting':
      case 'thanks':
      case 'goodbye':
        scoreChange = 2;
        level = 'cold';
        break;
      default:
        scoreChange = 5;
        level = 'cold';
    }

    // Update or create lead
    const lead = await this.prisma.lead.upsert({
      where: {
        customerId_tenantId: {
          customerId,
          tenantId,
        },
      },
      create: {
        id: uuidv4(),
        customerId,
        tenantId,
        intentScore: scoreChange,
      },
      update: {
        intentScore: { increment: scoreChange },
      },
    });

    // Determine level based on score
    const currentScore = lead.intentScore || 0;
    if (currentScore >= 30) {
      level = 'hot';
    } else if (currentScore >= 10) {
      level = 'warm';
    } else {
      level = 'cold';
    }

    return {
      score: currentScore,
      level,
    };
  }

  async getLeadScore(customerId: string, tenantId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: {
        customerId_tenantId: {
          customerId,
          tenantId,
        },
      },
    });

    if (!lead) {
      return { score: 0, level: 'cold' };
    }

    let level = 'cold';
    const currentScore = lead.intentScore || 0;
    if (currentScore >= 30) {
      level = 'hot';
    } else if (currentScore >= 10) {
      level = 'warm';
    }

    return {
      score: currentScore,
      level,
    };
  }
}
