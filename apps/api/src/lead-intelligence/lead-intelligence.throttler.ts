import { Injectable, Logger } from '@nestjs/common';
import { LeadIntelligenceError } from './lead-intelligence.errors';

@Injectable()
export class LeadIntelligenceThrottler {
  private readonly logger = new Logger(LeadIntelligenceThrottler.name);
  private rateLimits = new Map<string, { count: number; lastReset: number }>();

  async checkRateLimit(tenantId: string) {
    const now = Date.now();
    const limit = this.rateLimits.get(tenantId) || { count: 0, lastReset: now };

    // Reset every minute
    if (now - limit.lastReset > 60 * 1000) {
      limit.count = 0;
      limit.lastReset = now;
    }

    // Limit: 20 requests per minute
    if (limit.count >= 20) {
      throw new LeadIntelligenceError('Rate limit exceeded');
    }

    limit.count++;
    this.rateLimits.set(tenantId, limit);
  }
}