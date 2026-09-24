import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateKnowledgeDto {
  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsString()
  @IsIn(['product', 'faq', 'document', 'url', 'general'])
  type: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  botId?: string;
}
