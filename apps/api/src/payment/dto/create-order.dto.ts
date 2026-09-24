import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body for POST /payment/create-order.
 * `plan` must match a Plan.name (FREE / BASIC / PRO / ENTERPRISE).
 */
export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  plan: string;
}
