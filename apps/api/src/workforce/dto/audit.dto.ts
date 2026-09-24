import { IsString, IsOptional, IsIn, IsObject, IsBoolean } from 'class-validator';

export class CreateAuditDto {
  @IsString()
  action: string;

  @IsString()
  resource: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsObject()
  detail?: any;

  @IsOptional()
  @IsIn(['USER', 'AI_EMPLOYEE', 'SERVICE', 'SYSTEM'])
  actorType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsBoolean()
  success?: boolean;
}

export class QueryAuditV2Dto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsString()
  success?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
