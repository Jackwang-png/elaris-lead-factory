import { IsOptional, IsString, IsInt, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueryAuditDto {
  @ApiPropertyOptional({ description: '当前页', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ description: '操作类型筛选' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  action?: string;

  @ApiPropertyOptional({ description: '资源类型筛选' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resource?: string;

  @ApiPropertyOptional({ description: '用户ID筛选' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '搜索关键词（匹配 action/resource/detail）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ description: '是否成功' })
  @IsOptional()
  success?: boolean;

  @ApiPropertyOptional({ description: '开始日期 (ISO format)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: '结束日期 (ISO format)' })
  @IsOptional()
  @IsString()
  to?: string;
}
