import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Req,
  Headers,
  Res,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { Public } from '../common/decorators/public.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ConfirmPaidDto } from './dto/confirm-paid.dto';
import { PaymentOrderStatus } from '@prisma/client';

@Controller('payment')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('create-order')
  async createOrder(@Body() body: CreateOrderDto, @Req() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.paymentService.createOrder(tenantId, body.plan);
  }

  /**
   * Payment-provider webhook callback.
   * Public (no JWT) but protected by HMAC signature + order ledger + idempotency.
   * Requires `X-Signature` header = HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET).
   */
  @Public()
  @Post('notify')
  async notify(
    @Body() payload: any,
    @Req() req,
    @Headers('x-signature') signature?: string,
  ) {
    const rawBody = req.rawBody ?? JSON.stringify(payload);
    return this.paymentService.notify(payload, rawBody, signature);
  }

  @Get('check/:tenantId')
  async checkSubscription(@Param('tenantId') tenantId: string) {
    return this.paymentService.checkSubscription(tenantId);
  }

  @Get('revenue')
  async getRevenue() {
    return this.paymentService.getRevenue();
  }

  /**
   * Customer marks a self-hosted QR order as paid.
   * Order moves to AWAITING_CONFIRM until the admin verifies the transfer.
   * PUBLIC: the cashier page is opened from a shared payment link without a
   * session — the final activation is still gated by admin amount check.
   */
  @Public()
  @Post('confirm-paid')
  async confirmPaid(@Body() body: ConfirmPaidDto, @Req() req) {
    const tenantId = req.user?.tenantId || req.tenantId;
    return this.paymentService.confirmPaid(body.orderId, tenantId);
  }

  /** Admin: list orders awaiting confirmation (self-hosted QR channel). */
  @Public()
  @UseGuards(AdminKeyGuard)
  @Get('awaiting-confirm')
  async listAwaitingConfirm(
    @Query('key') adminKey?: string,
    @Headers('x-admin-key') headerKey?: string,
  ) {
    return this.paymentService.listAwaitingConfirm(adminKey || headerKey);
  }

  /** Admin: confirm a self-hosted QR payment (manual activation). */
  @Public()
  @UseGuards(AdminKeyGuard)
  @Post('admin-confirm')
  async adminConfirm(
    @Body() body: { orderId: string; key?: string; paidAmount?: number },
    @Headers('x-admin-key') headerKey?: string,
  ) {
    return this.paymentService.adminConfirmOrder(
      body?.orderId,
      body?.key || headerKey,
      body?.paidAmount,
    );
  }

  /**
   * Self-hosted cashier page: shows the amount + merchant QR image.
   * Public (no JWT) — the page is opened from the payment URL.
   */
  @Public()
  @Get('cashier/:orderId')
  async cashierPage(
    @Param('orderId') orderId: string,
    @Res() res: Response,
    @Query('channel') channel?: string,
  ) {
    const html = await this.paymentService.renderCashierPage(orderId, channel);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  /** Serve the uploaded merchant QR image (self-hosted channel). */
  @Public()
  @Get('qr-image')
  async qrImage(@Query('channel') channel: string | undefined, @Res() res: Response) {
    const isWechat = channel === 'wechat' || channel === 'wx';
    const file = isWechat
      ? join(process.cwd(), 'assets', 'wechat-qr.jpg')
      : join(process.cwd(), 'assets', 'alipay-qr.jpg');
    if (!existsSync(file)) {
      res.status(404).send('QR image not configured');
      return;
    }
    const buf = readFileSync(file);
    res.setHeader('Content-Type', 'image/jpeg');
    // No caching: the QR image must never be served stale (cache has
    // previously caused the WeChat QR to be replaced by the Alipay one).
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(buf);
  }

  /**
   * Order status JSON for the cashier page polling.
   * Public read-only snapshot (orderId + status only — no sensitive data).
   */
  @Public()
  @Get('cashier/:orderId/status')
  async cashierStatus(@Param('orderId') orderId: string) {
    return this.paymentService.getCashierStatus(orderId);
  }
}
