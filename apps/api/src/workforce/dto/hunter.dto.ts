import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class HunterQualificationDto {
  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  criteria?: any;

  @IsOptional()
  @IsString()
  scoringModel?: string;

  @IsOptional()
  @IsObject()
  scoreExplanation?: any;
}

export class HunterQualifiedDto {
  @IsString()
  leadId: string;

  @IsOptional()
  @IsObject()
  qualification?: HunterQualificationDto;

  @IsOptional()
  @IsObject()
  research?: any;

  @IsOptional()
  @IsArray()
  conversationHistory?: any[];

  @IsOptional()
  @IsObject()
  recommendedStrategy?: any;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsBoolean()
  needsHuman?: boolean;

  @IsOptional()
  @IsString()
  handoffReason?: string;

  @IsOptional()
  @IsObject()
  contact?: { name?: string; email?: string; phone?: string };
}

export class CreateOpportunityDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsNumber()
  leadScore?: number;

  @IsOptional()
  @IsString()
  leadGrade?: string;

  @IsOptional()
  @IsObject()
  qualificationData?: any;

  @IsOptional()
  @IsString()
  scoringModel?: string;

  @IsOptional()
  @IsObject()
  scoreExplanation?: any;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsString()
  nextFollowUpAt?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}

export class QueryOpportunitiesDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateApiKeyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsArray()
  scopes?: string[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
