import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { InviteCodesService } from '../admin/invite-codes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@Controller('subscription')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly inviteCodesService: InviteCodesService,
  ) {}

  @Get('plans')
  async plans() {
    return this.subscriptionService.listPlans();
  }

  @Post('create')
  async create(@Body('plan') plan: string, @Req() req) {
    return this.subscriptionService.createSubscription(req.tenantId, plan);
  }

  @Get('current')
  async current(@Req() req) {
    return this.subscriptionService.getCurrentSubscription(req.tenantId);
  }

  @Post('upgrade')
  async upgrade(@Body('plan') plan: string, @Req() req) {
    return this.subscriptionService.upgradePlan(req.tenantId, plan);
  }

  /** 用户自己的裂变邀请码：首次自动创建，后续返回同一码 */
  @Get('referral-code')
  async referralCode(@Req() req) {
    return this.inviteCodesService.getOrCreateUserReferralCode(req.user.id, req.tenantId);
  }
}
