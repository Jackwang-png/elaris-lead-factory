import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body for POST /payment/confirm-paid.
 * 客户在自助收银台点击「已支付」后确认订单。
 * orderId 必填：缺失/为空时由全局 ValidationPipe 返回 400（此前空 body 直接 500）。
 */
export class ConfirmPaidDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;
}
