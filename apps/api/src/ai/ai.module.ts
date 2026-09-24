import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UsageModule } from '../usage/usage.module';
import { HandoffModule } from '../handoff/handoff.module';
import { QuotaModule } from '../quota/quota.module';
import { AiQuotaService } from '../quota/ai-quota.service';
import { AiProvidersModule } from './providers/ai-providers.module';
import { AiService } from './ai.service';
import { IntentService } from './pipeline/intent.service';
import { CustomerMemoryService } from './pipeline/customer-memory.service';
import { KnowledgeRetrievalService } from './pipeline/knowledge-retrieval.service';
import { RecommendationService } from './pipeline/recommendation.service';
import { LeadScoreService } from './pipeline/lead-score.service';
import { AiPipelineService } from './pipeline/ai-pipeline.service';
import { SalesStrategyService } from './pipeline/sales-strategy.service';
import { ResponseGenerationService } from './pipeline/response-generation.service';
import { AiController } from './ai.controller';
import { ProductsService } from '../products/products.service';
import { EmbeddingService } from '../knowledge/embedding.service';

@Module({
  imports: [PrismaModule, UsageModule, HandoffModule, AiProvidersModule, QuotaModule],
  controllers: [AiController],
  providers: [
    AiService,
    IntentService,
    CustomerMemoryService,
    KnowledgeRetrievalService,
    RecommendationService,
    LeadScoreService,
    AiPipelineService,
    SalesStrategyService,
    ResponseGenerationService,
    ProductsService,
    EmbeddingService,
  ],
  exports: [
    AiService,
    IntentService,
    CustomerMemoryService,
    KnowledgeRetrievalService,
    RecommendationService,
    LeadScoreService,
    AiPipelineService,
    SalesStrategyService,
    AiQuotaService,
  ],
})
export class AiModule {}
