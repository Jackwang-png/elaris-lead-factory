import { IsString, IsOptional, IsObject } from 'class-validator';

export class AdminAgentAskDto {
  @IsString()
  message: string;

  /** 可选：指定目标租户（平台全局统计时留空） */
  @IsOptional()
  @IsString()
  tenantId?: string;

  /** C 类（真正执行）时携带的操作 */
  @IsOptional()
  operation?: { id: string; params?: Record<string, any> };

  /** C 类二次确认标志 */
  @IsOptional()
  confirm?: boolean;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}
