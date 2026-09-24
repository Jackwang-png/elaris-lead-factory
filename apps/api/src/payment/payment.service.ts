import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  SubscriptionStatus,
  PaymentOrderStatus,
  PaymentProvider as PaymentProviderEnum,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { verifyWebhookSignature } from './webhook-signature.util';
import { PaymentExecutionService } from './execution/payment-execution.service';
import { PaymentOperation } from './execution/payment-execution.types';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PaymentError, PaymentErrorCode } from './domain/payment.errors';
import { toMinorUnits } from './domain/payment.amount';
import { renderCashierPageHtml, renderCashierErrorHtml } from './cashier-page';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly paymentExecution: PaymentExecutionService,
    private readonly providerRegistry: PaymentProviderRegistry,
  ) {}

  /**
   * Create a payment order for a tenant + plan.
   * Free plans activate the subscription immediately; paid plans persist a
   * PaymentOrder(PENDING) record so the webhook can later verify it.
   */
  async createOrder(tenantId: string, plan: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const planRecord = await this.prisma.plan.findFirst({
      where: { name: plan },
    });
    if (!planRecord) {
      throw new NotFoundException('Plan not found');
    }

    const existing = await this.prisma.subscription.findFirst({
      include: { plan: true },
      where: {
        tenantId,
        status: SubscriptionStatus.ACTIVE,
        plan: { name: plan },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Already have an active subscription for this plan',
      );
    }

    const amount = planRecord.price;

    if (amount === 0) {
      // Free plan: activate immediately and record as a PAID order.
      const now = new Date();
      const expireAt = new Date(now);
      expireAt.setMonth(expireAt.getMonth() + 1);
      const subscription = await this.prisma.subscription.create({
        data: {
          tenant: { connect: { id: tenantId } },
          plan: { connect: { id: planRecord.id } },
          status: SubscriptionStatus.ACTIVE,
          startAt: now,
          expireAt,
        },
      });
      const order = await this.prisma.paymentOrder.create({
        data: {
          orderId: `order_${Date.now()}_${randomUUID().slice(0, 8)}`,
          idempotencyKey: randomUUID(),
          tenantId,
          planId: planRecord.id,
          subscriptionId: subscription.id,
          provider: PaymentProviderEnum.MANUAL,
          amount,
          status: PaymentOrderStatus.PAID,
          paidAt: now,
        },
      });
      return { orderId: order.orderId, subscription, amount: 0, paymentUrl: null };
    }

    // Paid plan: persist a PENDING order (the source of truth the webhook must match).
    //
    // T2.9 idempotency: the same tenant + plan must not create unlimited
    // duplicate orders. Reuse an existing unfinished order when present;
    // refuse when the plan was already paid.
    const existingPending = await this.prisma.paymentOrder.findFirst({
      where: {
        tenantId,
        planId: planRecord.id,
        status: { in: [PaymentOrderStatus.PENDING, PaymentOrderStatus.PAYING] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      return {
        orderId: existingPending.orderId,
        idempotencyKey: existingPending.idempotencyKey,
        amount,
        paymentUrl: existingPending.rawPayload?.['paymentUrl'] ?? null,
        plan,
      };
    }

    const existingPaid = await this.prisma.paymentOrder.findFirst({
      where: {
        tenantId,
        planId: planRecord.id,
        status: PaymentOrderStatus.PAID,
      },
    });
    if (existingPaid) {
      throw new BadRequestException(
        'Already paid for this plan — subscription is active',
      );
    }

    const orderId = `order_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const idempotencyKey = randomUUID();
    // Channel selection is registry-driven (no provider-specific branch):
    // the enabled provider with the highest priority (e.g. selfhosted QR /
    // aggregate) becomes the ledger provider for this order.
    const defaultProvider = this.providerRegistry.getDefault();
    const providerEnum =
      (PaymentProviderEnum[defaultProvider.name.toUpperCase() as keyof typeof PaymentProviderEnum] ??
        PaymentProviderEnum.MANUAL);
    const order = await this.prisma.paymentOrder.create({
      data: {
        orderId,
        idempotencyKey,
        tenantId,
        planId: planRecord.id,
        provider: providerEnum,
        amount,
        status: PaymentOrderStatus.PENDING,
      },
    });

    // T2.9: domain amount boundary — convert to minor units ONCE here.
    // PaymentOrder.amount stays Float (yuan) for DB/API compatibility;
    // the provider adapter owns the external amount format later.
    const amountMinorUnits = toMinorUnits(amount);

    // T2.8/T2.9: route provider order creation through the Execution Boundary
    // (selection / circuit / retry / failover / idempotency all live there).
    let paymentUrl: string | null = null;
    try {
      const result = await this.paymentExecution.execute(
        PaymentOperation.CREATE_ORDER,
        {
          idempotencyKey,
          tenantId,
          merchantOrderId: orderId,
          operation: (provider, _attempt) =>
            provider.createOrder({
              orderId,
              tenantId,
              plan,
              amount: amountMinorUnits,
              currency: 'CNY',
              idempotencyKey,
            }),
        },
      );
      paymentUrl = result.paymentUrl;
      // Persist the paymentUrl on the order so duplicate-create returns it.
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          rawPayload: { paymentUrl } as never,
          status: PaymentOrderStatus.PAYING,
        },
      });
    } catch (err) {
      if (
        err instanceof PaymentError &&
        (err.code === PaymentErrorCode.NOT_IMPLEMENTED ||
          err.code === PaymentErrorCode.PROVIDER_NOT_AVAILABLE)
      ) {
        // SKELETON COMPATIBILITY FALLBACK (temporary):
        // Provider skeleton is NOT_IMPLEMENTED / no provider enabled. We do
        // NOT fake a provider success — the order stays PENDING, no fake
        // transaction id, no PAID status. Only the payment URL placeholder
        // is kept to preserve the existing API response shape.
        this.logger.warn(
          `[createOrder] provider skeleton fallback for order ${orderId}: ${err.message}`,
        );
        paymentUrl = `https://pay.example.com/pay?orderId=${order.orderId}&amount=${amount}&plan=${plan}`;
      } else if (
        err instanceof PaymentError &&
        err.code === PaymentErrorCode.UNKNOWN_SIDE_EFFECT
      ) {
        // T2.7 semantics: outcome unknown — mark order UNKNOWN, never
        // auto-retry / auto-failover / create a second payment.
        await this.prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: PaymentOrderStatus.UNKNOWN },
        });
        throw err;
      } else {
        throw err;
      }
    }

    return {
      orderId: order.orderId,
      idempotencyKey: order.idempotencyKey,
      amount,
      paymentUrl,
      plan,
    };
  }

  /**
   * Query a payment order via the Execution Boundary (QUERY_ORDER).
   * Retryable, no idempotency key required, provider selected by registry.
   */
  async queryOrder(orderId: string, tenantId?: string) {
    return this.paymentExecution.execute(PaymentOperation.QUERY_ORDER, {
      tenantId,
      merchantOrderId: orderId,
      operation: (provider, _attempt) =>
        provider.queryOrder({ orderId }),
    });
  }

  /**
   * Close a payment order via the Execution Boundary (CLOSE_ORDER).
   * No automatic retry / failover (per T2.7 Retry Safety Matrix).
   */
  async closeOrder(orderId: string, tenantId?: string) {
    return this.paymentExecution.execute(PaymentOperation.CLOSE_ORDER, {
      tenantId,
      merchantOrderId: orderId,
      operation: (provider, _attempt) =>
        provider.closeOrder({ orderId }),
    });
  }

  /**
   * Refund via the Execution Boundary (REFUND).
   * Idempotency key REQUIRED — missing key is rejected before any provider
   * call (FATAL_ERROR), retries keep the same key, no provider switch on
   * unknown outcome.
   */
  async refund(params: {
    orderId: string;
    refundId: string;
    providerOrderId?: string;
    amount: number;
    currency: string;
    reason?: string;
  }, idempotencyKey: string, tenantId?: string) {
    return this.paymentExecution.execute(PaymentOperation.REFUND, {
      idempotencyKey,
      tenantId,
      merchantOrderId: params.orderId,
      operation: (provider, _attempt) => provider.refund(params),
    });
  }

  /**
   * Query a refund via the Execution Boundary (QUERY_REFUND).
   * Retryable, no idempotency key required.
   */
  async queryRefund(refundId: string, tenantId?: string) {
    return this.paymentExecution.execute(PaymentOperation.QUERY_REFUND, {
      tenantId,
      operation: (provider, _attempt) =>
        provider.queryRefund({ refundId }),
    });
  }

  /**
   * Handle a payment-provider webhook notification.
   *
   * Two paths:
   *   1. Legacy HMAC path (self-issued / test callbacks) — unchanged.
   *   2. MaPay aggregate callback path — verified through the
   *      AggregatePaymentProvider (official MD5 rule), normalized to a
   *      NormalizedPaymentEvent, then applied to order + subscription.
   *      Returns the plain string `success` the platform expects.
   */
  async notify(
    payload: any,
    rawBody: string | Buffer,
    signature: string | undefined,
  ) {
    // Aggregate (MaPay) callback detection: trade_status is its success field.
    if (payload && typeof payload === 'object' && 'trade_status' in payload) {
      return this.handleAggregateNotify(
        rawBody ?? Buffer.from(JSON.stringify(payload)),
      );
    }

    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    if (!secret) {
      // Fail-closed: never allow activation without a configured secret.
      throw new InternalServerErrorException(
        'Payment webhook secret is not configured',
      );
    }

    const bodyForVerify = rawBody ?? JSON.stringify(payload);
    if (!signature || !verifyWebhookSignature(bodyForVerify, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const { orderId, status, tenantId, plan, amount } = payload;
    if (!orderId || !status || !tenantId || !plan) {
      throw new BadRequestException('Invalid notification payload');
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
      include: { plan: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Idempotency: already fulfilled — return the existing result without re-activating.
    if (order.status === PaymentOrderStatus.PAID) {
      return {
        received: true,
        message: 'Order already processed',
        orderId,
        subscriptionId: order.subscriptionId,
      };
    }

    // Consistency: the notification must match the ledger record.
    if (order.tenantId !== tenantId || order.plan.name !== plan) {
      this.logger.warn(
        `Notification mismatch for order ${orderId} (ledger tenant=${order.tenantId}/${order.plan.name} vs payload ${tenantId}/${plan})`,
      );
      throw new BadRequestException('Notification does not match order');
    }
    if (typeof amount === 'number' && amount !== order.amount) {
      throw new BadRequestException('Amount mismatch');
    }

    if (status !== 'success') {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: PaymentOrderStatus.CANCELLED,
          rawPayload: payload,
        },
      });
      return { received: true, message: 'Payment not successful' };
    }

    // Success: cancel prior active subscriptions, create the new one, mark order PAID.
    const subscription = await this.activateSubscription(order, payload);
    return { received: true, subscription, orderId };
  }

  /**
   * MaPay aggregate callback: verify MD5 sign → normalize → apply to order.
   * Always returns the literal `success` the platform requires on receipt.
   */
  private async handleAggregateNotify(rawBody: string | Buffer): Promise<string> {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

    // Verify + normalize through the AggregatePaymentProvider (official MD5 rule).
    let event: import('./providers/payment-provider.interface').NormalizedPaymentEvent;
    try {
      event = await this.paymentExecution.execute(
        PaymentOperation.VERIFY_WEBHOOK,
        {
          providerName: 'aggregate', // MaPay is the aggregate channel
          operation: async (provider, _attempt) => {
            const verification = await provider.verifyWebhook(body, {});
            if (!verification.valid) {
              throw new PaymentError('Invalid aggregate webhook signature', {
                code: PaymentErrorCode.BUSINESS_ERROR,
                provider: provider.name,
                retryable: false,
              });
            }
            return provider.normalize(body, {});
          },
        },
      );
    } catch (err) {
      this.logger.warn(`[notify] aggregate callback rejected: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid aggregate webhook signature');
    }

    if (!event.orderId) {
      throw new BadRequestException('Invalid aggregate notification payload');
    }

    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId: event.orderId },
      include: { plan: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Idempotency: already fulfilled — never re-activate.
    if (order.status === PaymentOrderStatus.PAID) {
      return 'success';
    }

    // Amount consistency (minor units): order.amount is yuan Float.
    if (event.amount !== undefined && event.amount !== toMinorUnits(order.amount)) {
      this.logger.warn(
        `[notify] amount mismatch for order ${event.orderId} (ledger ${order.amount} vs callback ${event.amount})`,
      );
      throw new BadRequestException('Amount mismatch');
    }

    if (event.eventType !== 'PAYMENT_SUCCEEDED') {
      await this.prisma.paymentOrder.update({
        where: { id: order.id },
        data: {
          status: PaymentOrderStatus.CANCELLED,
          rawPayload: JSON.parse(JSON.stringify(event)) as never,
        },
      });
      return 'success';
    }

    // Success: cancel prior active subscriptions, create the new one, mark order PAID.
    await this.activateSubscription(order, event);
    return 'success';
  }

  /** Shared success path: cancel prior ACTIVE subs, create new one, mark order PAID. */
  private async activateSubscription(
    order: {
      id: string;
      orderId: string;
      tenantId: string;
      planId: string;
      subscriptionId: string | null;
    },
    rawPayload: unknown,
  ) {
    const now = new Date();
    const expireAt = new Date(now);
    expireAt.setMonth(expireAt.getMonth() + 1);

    await this.prisma.subscription.updateMany({
      where: { tenantId: order.tenantId, status: SubscriptionStatus.ACTIVE },
      data: { status: SubscriptionStatus.CANCELLED },
    });

    const subscription = await this.prisma.subscription.create({
      data: {
        tenant: { connect: { id: order.tenantId } },
        plan: { connect: { id: order.planId } },
        status: SubscriptionStatus.ACTIVE,
        startAt: now,
        expireAt,
      },
    });

    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.PAID,
        paidAt: now,
        subscriptionId: subscription.id,
        rawPayload: JSON.parse(JSON.stringify(rawPayload)) as never,
      },
    });

    return subscription;
  }

  /**
   * Customer claims they paid the self-hosted QR order.
   * Moves the order to AWAITING_CONFIRM (admin must verify the transfer
   * before the subscription activates). No provider call involved.
   */
  async confirmPaid(orderId: string, tenantId?: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
      include: { plan: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (tenantId && order.tenantId !== tenantId) {
      throw new UnauthorizedException('Not your order');
    }
    if (order.status === PaymentOrderStatus.PAID) {
      return { orderId, status: PaymentOrderStatus.PAID };
    }
    if (order.status === PaymentOrderStatus.AWAITING_CONFIRM) {
      return { orderId, status: PaymentOrderStatus.AWAITING_CONFIRM };
    }
    await this.prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.AWAITING_CONFIRM,
        rawPayload: {
          ...((order.rawPayload as Record<string, unknown>) ?? {}),
          confirmedBy: 'customer',
          confirmedAt: new Date().toISOString(),
        },
      },
    });
    this.logger.log(`[confirmPaid] order ${orderId} awaiting admin confirm`);
    return { orderId, status: PaymentOrderStatus.AWAITING_CONFIRM };
  }

  /**
   * Admin confirms a self-hosted QR payment after verifying the transfer.
   * This is the manual-activation path (no external webhook).
   */
  async adminConfirmOrder(orderId: string, adminKey?: string, paidAmount?: number) {
    const expected = this.config.get<string>('PAYMENT_ADMIN_KEY');
    if (!expected || adminKey !== expected) {
      throw new UnauthorizedException('Invalid admin key');
    }
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
      include: { plan: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === PaymentOrderStatus.PAID) {
      return { orderId, status: PaymentOrderStatus.PAID };
    }
    if (order.status !== PaymentOrderStatus.AWAITING_CONFIRM) {
      throw new BadRequestException(
        `Order ${orderId} is not awaiting confirmation (${order.status})`,
      );
    }

    // Anti-fraud guard: the verified received amount MUST equal the order
    // amount (to the fen). Paying ¥99 must never open a ¥299 plan.
    const orderAmount = Number(order.amount);
    const verified = paidAmount === undefined ? orderAmount : Number(paidAmount);
    if (!Number.isFinite(verified) || Math.abs(verified - orderAmount) > 0.001) {
      this.logger.warn(
        `[adminConfirmOrder] amount mismatch order ${orderId}: order=${orderAmount} paid=${verified} — REJECTED`,
      );
      throw new BadRequestException(
        `收款金额 ${verified.toFixed(2)} 与订单金额 ${orderAmount.toFixed(2)} 不符，已拒绝开通`,
      );
    }

    const subscription = await this.activateSubscription(order, {
      provider: 'selfhosted',
      confirmedBy: 'admin',
      confirmedAt: new Date().toISOString(),
      orderId,
      paidAmount: verified,
      amountVerified: true,
    });
    this.logger.log(`[adminConfirmOrder] order ${orderId} -> PAID, sub ${subscription.id}`);
    return { orderId, status: PaymentOrderStatus.PAID, subscription, verifiedAmount: verified };
  }

  /**
   * List orders awaiting admin confirmation (self-hosted QR channel).
   */
  async listAwaitingConfirm(adminKey?: string) {
    const expected = this.config.get<string>('PAYMENT_ADMIN_KEY');
    if (!expected || adminKey !== expected) {
      throw new UnauthorizedException('Invalid admin key');
    }
    const orders = await this.prisma.paymentOrder.findMany({
      where: { status: PaymentOrderStatus.AWAITING_CONFIRM },
      include: { plan: true, tenant: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return orders.map((o) => ({
      orderId: o.orderId,
      amount: o.amount,
      plan: o.plan.name,
      tenantName: o.tenant.name,
      createdAt: o.createdAt,
      status: o.status,
    }));
  }

  /**
   * Render the self-hosted cashier page (amount + merchant QR + pay button).
   */
  async renderCashierPage(orderId: string, channel?: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
      include: { plan: true },
    });
    if (!order) {
      return renderCashierErrorHtml('订单不存在');
    }
    const ch: 'ali' | 'wx' = channel === 'wx' ? 'wx' : 'ali';
    return renderCashierPageHtml({
      orderId,
      status: order.status,
      amount: Number(order.amount).toFixed(2),
      planName: order.plan.name,
      qrPaths: {
        ali: `/payment/qr-image?channel=ali&v=2`,
        wx: `/payment/qr-image?channel=wx&v=2`,
      },
      apiBase: process.env.PUBLIC_API_URL ?? '',
    });
  }

  /** Public cashier status snapshot (orderId + status only). */
  async getCashierStatus(orderId: string) {
    const order = await this.prisma.paymentOrder.findUnique({
      where: { orderId },
      select: { status: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return { orderId, status: order.status };
  }

  async checkSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      include: { plan: true },
      where: { tenantId, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) {
      return { tenantId, status: 'none' };
    }
    const expired = new Date() > (sub.expireAt ?? new Date(0));
    if (expired) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });
      return { tenantId, status: 'expired' };
    }
    return { tenantId, status: 'active', plan: sub.plan.name, expireAt: sub.expireAt };
  }

  async getRevenue() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: { plan: true },
      where: { status: SubscriptionStatus.ACTIVE },
    });

    let totalRevenue = 0;
    for (const sub of subscriptions) {
      totalRevenue += sub.plan.price;
    }

    return {
      totalRevenue,
      activeSubscriptions: subscriptions.length,
      breakdown: {
        free: subscriptions.filter((s) => s.plan.name === 'FREE').length,
        basic: subscriptions.filter((s) => s.plan.name === 'BASIC').length,
        pro: subscriptions.filter((s) => s.plan.name === 'PRO').length,
        enterprise: subscriptions.filter((s) => s.plan.name === 'ENTERPRISE').length,
      },
    };
  }
}
