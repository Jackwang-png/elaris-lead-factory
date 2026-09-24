import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Body for POST /chat/message.
 * 三个字段均必填：缺失/为空时由全局 ValidationPipe 返回 400
 * （此前空 body 会以 undefined 传入 Prisma where 导致 500）。
 */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  botId: string;

  @IsString()
  @IsNotEmpty()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  message: string;
}
