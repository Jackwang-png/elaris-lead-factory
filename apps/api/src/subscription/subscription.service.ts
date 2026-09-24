import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async getPlan(name: string) {
    return this.prisma.plan.findFirstOrThrow({
      where: { name },
    });
  }

  async listPlans() {
    return this.prisma.plan.findMany({ orderBy: { price: 'asc' } });
  }

  async createSubscription(tenantId: string, planName: string) {
    const plan = await this.getPlan(planName);
    const existing = await this.prisma.subscription.findFirst({
      include: { plan: true },
      where: { tenantId, status: SubscriptionStatus.ACTIVE },
    });
    if (existing) {
      throw new BadRequestException('Tenant already has an active subscription');
    }

    const now = new Date();
    const expireAt = new Date(now);
    expireAt.setMonth(expireAt.getMonth() + 1); // 1 month subscription

    return this.prisma.subscription.create({
      data: {
        tenantId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startAt: now,
        expireAt,
      },
    });
  }

  /**
   * 是否为 Trial（免费试用层）：按套餐推导 —— 仅 FREE 套餐（price=0）即视为试用层，
   * 不受 expireAt 时长影响（7 天 Trial 经 referral +3 天后变 10 天，仍属免费试用阶段）。
   * 不新增字段，由 Plan.price 推导，满足 GROWTH-STAFF-05 的 isTrial 修正要求。
   */
  private isTrial(sub: { plan?: { price: number } | null }): boolean {
    return !!sub.plan && sub.plan.price === 0;
  }

  async getCurrentSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      include: { plan: true },
      where: { tenantId, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) {
      throw new NotFoundException('No active subscription found');
    }
    return { ...sub, isTrial: this.isTrial(sub) };
  }

  async isExpired(subscriptionId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) return true;
    return new Date() > (sub.expireAt ?? new Date(0));
  }

  async upgradePlan(tenantId: string, newPlanName: string) {
    const newPlan = await this.getPlan(newPlanName);
    const current = await this.getCurrentSubscription(tenantId);
    if (current.planId === newPlan.id) {
      throw new BadRequestException('Already on this plan');
    }

    // Cancel current and create new
    await this.prisma.subscription.update({
      where: { id: current.id },
      data: { status: SubscriptionStatus.CANCELLED },
    });

    return this.createSubscription(tenantId, newPlanName);
  }
}
