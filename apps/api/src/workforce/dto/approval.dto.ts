import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';

export class QueryApprovalsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  riskLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ApproveApprovalDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectApprovalDto {
  @IsString()
  reason: string;
}
