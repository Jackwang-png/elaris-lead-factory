import { IsOptional, IsString } from 'class-validator';

/** 撤销/激活 API key 时可选备注（不落库明文，仅审计 detail） */
export class ApiKeyLifecycleDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
