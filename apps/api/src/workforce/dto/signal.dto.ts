import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsObject,
  IsArray,
  IsEmail,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SignalCompanyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  icpScore?: number;
}

export class SignalContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateSignalDto {
  @IsOptional()
  @IsIn(['daily_batch', 'manual_submit', 'event_trigger'])
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsString()
  signalType: string;

  @IsOptional()
  @IsString()
  signalStrength?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  relevanceScore?: number;

  @IsOptional()
  @IsIn(['verified', 'pending', 'rejected'])
  credibility?: string;

  @IsOptional()
  @IsString()
  evidence?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  rawData?: any;

  @IsOptional()
  @IsString()
  evidenceHash?: string;

  @IsOptional()
  @IsString()
  recommendedAction?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SignalCompanyDto)
  company?: SignalCompanyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SignalContactDto)
  contact?: SignalContactDto;
}

export class QuerySignalsDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  signalType?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
