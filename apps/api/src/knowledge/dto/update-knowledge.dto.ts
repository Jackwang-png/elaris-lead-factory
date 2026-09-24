import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateKnowledgeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @IsIn(['product', 'faq', 'document', 'url', 'general'])
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
