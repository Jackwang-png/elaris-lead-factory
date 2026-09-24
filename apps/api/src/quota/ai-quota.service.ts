import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsageService } from '../usage/usage.service';
import { SubscriptionStatus } from '@prisma/client';
import {
  QuotaExceededException,
  SubscriptionExpiredException,
} from './quota.exceptions';

export interface QuotaState {
  enabled: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  resetsAt: string;
}

/**
 * 统一 AI 消息额度服务。
 *
 * 所有 AI 能力（Merchant AI 员工 / Dashboard AI / Widget / 员工 AI 辅助 / 后续新增）
 * 共用同一额度，禁止各模块自行维护 quota。
 *
 * 计数规则（由调用方保证）：仅当“AI 成功生成并发送一条回复”时调用一次
 * consumeSuccessfulResponse；用户输入 / 失败 / 超时 / 未成功发送均不计数。
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(
    private prisma: PrismaService,
    private subscriptionService: SubscriptionService,
    private usageService: UsageService,
  ) {}

  /** 当前 tenant 当前自然日 00:00:00（复用 UsageService 既有 date 语义）。 */
  private today(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private nextReset(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d;
  }

  /** 返回当前 tenant 的有效日限额；无有效订阅返回 0。 */
  private async getDailyLimit(tenantId: string): Promise<number> {
    try {
      const sub = await this.subscriptionService.getCurrentSubscription(tenantId);
      const notExpired = !sub.expireAt || sub.expireAt > new Date();
      if (sub.status !== SubscriptionStatus.ACTIVE || !notExpired) return 0;
      return sub.plan?.dailyLimit ?? 0;
    } catch {
      return 0;
    }
  }

  async getQuotaState(tenantId: string): Promise<QuotaState> {
    const dailyLimit = await this.getDailyLimit(tenantId);
    const enabled = dailyLimit > 0;
    const usage = await this.usageService.getDailyUsage(tenantId);
    const usedToday = usage?.messageCount ?? 0;
    const remaining = enabled ? Math.max(0, dailyLimit - usedToday) : 0;

    return {
      enabled,
      dailyLimit,
      usedToday,
      remaining,
      resetsAt: this.nextReset().toISOString(),
    };
  }

  /**
   * 请求开始预检：订阅有效 + 理论仍有额度。不通过直接抛异常（HTTP 层返回 code）。
   * 仅做理论预检；真正的并发安全由 consumeSuccessfulResponse 的原子 UPDATE 保证。
   */
  async assertCanRespond(tenantId: string): Promise<QuotaState> {
    const state = await this.getQuotaState(tenantId);
    if (!state.enabled) throw new SubscriptionExpiredException();
    if (state.remaining <= 0) throw new QuotaExceededException();
    return state;
  }

  /**
   * 原子消费一次成功 AI 回复。
   *
   * 用 updateMany(where: messageCount < dailyLimit) 单条条件 UPDATE 保证并发安全：
   * 当日限额=1 时，并发两个请求只有一个能成功（另一个 affected=0 → quota_exceeded）。
   * 今日首条通过 create 创建；若并发创建触发唯一冲突，则回退到条件 UPDATE。
   * 禁止引入额外数据表，复用现有 Usage。
   */
  async consumeSuccessfulResponse(tenantId: string): Promise<number> {
    const dailyLimit = await this.getDailyLimit(tenantId);
    if (dailyLimit <= 0) throw new SubscriptionExpiredException();

    const today = this.today();

    const updated = await this.prisma.usage.updateMany({
      where: { tenantId, date: today, messageCount: { lt: dailyLimit } },
      data: { messageCount: { increment: 1 } },
    });
    if (updated.count === 1) {
      const fresh = await this.prisma.usage.findUnique({
        where: { tenantId_date: { tenantId, date: today } },
      });
      return fresh?.messageCount ?? dailyLimit;
    }

    const existing = await this.prisma.usage.findUnique({
      where: { tenantId_date: { tenantId, date: today } },
    });
    if (existing && existing.messageCount >= dailyLimit) {
      throw new QuotaExceededException();
    }

    try {
      await this.prisma.usage.create({
        data: { tenantId, date: today, messageCount: 1, tokenUsage: 0 },
      });
      return 1;
    } catch {
      // 唯一冲突（并发创建）→ 回退到条件 UPDATE
      const retry = await this.prisma.usage.updateMany({
        where: { tenantId, date: today, messageCount: { lt: dailyLimit } },
        data: { messageCount: { increment: 1 } },
      });
      if (retry.count === 1) {
        const fresh = await this.prisma.usage.findUnique({
          where: { tenantId_date: { tenantId, date: today } },
        });
        return fresh?.messageCount ?? dailyLimit;
      }
      throw new QuotaExceededException();
    }
  }
}
