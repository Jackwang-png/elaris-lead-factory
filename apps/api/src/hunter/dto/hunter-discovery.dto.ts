import { IsArray, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Input for POST /api/v2/hunter/discover.
 *
 * NOTE: there is deliberately NO `qualification` field here.
 * Qualification is always computed internally by Hunter V1.4.
 */
export class HunterDiscoverDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  urls?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  industry?: string;
}
