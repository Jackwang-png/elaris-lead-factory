import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiProvidersModule } from '../providers/ai-providers.module';
import { IntentService } from './intent.service';
import { RecommendationService } from './recommendation.service';
import { LeadService } from './lead.service';
import { MemoryService } from './memory.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { SalesStrategyService } from './sales-strategy.service';
import { ResponseGenerationService } from './response-generation.service';
import { CustomerMemoryService } from './customer-memory.service';
import { SalesRulesService } from './sales-rules.service';

@Module({
  imports: [PrismaModule, AiProvidersModule],
  providers: [IntentService, RecommendationService, LeadService, MemoryService, KnowledgeRetrievalService, SalesStrategyService, ResponseGenerationService, CustomerMemoryService, SalesRulesService],
  exports: [IntentService, RecommendationService, LeadService, MemoryService, KnowledgeRetrievalService, SalesStrategyService, ResponseGenerationService, CustomerMemoryService, SalesRulesService],
})
export class PipelineModule {}
