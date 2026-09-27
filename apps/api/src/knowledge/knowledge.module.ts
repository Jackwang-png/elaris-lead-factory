import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeTemplateController } from './knowledge-template.controller';
import { KnowledgeTemplateService } from './knowledge-template.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AiProvidersModule } from '../ai/providers/ai-providers.module';
import { DocumentProcessingService } from './document-processing.service';
import { EmbeddingService } from './embedding.service';
import { RagService } from './rag.service';
import { KnowledgeDocumentController } from './knowledge-document.controller';

@Module({
  imports: [PrismaModule, AiProvidersModule],
  // 注意顺序：KnowledgeDocumentController 的静态路由 /knowledge/documents
  // 必须先注册，否则会被 KnowledgeController 的 /knowledge/:id 参数路由遮蔽
  // （导致 GET /knowledge/documents 误命中 findOne('documents') 返回 404/500）。
  controllers: [KnowledgeDocumentController, KnowledgeController, KnowledgeTemplateController],
  providers: [
    KnowledgeService,
    KnowledgeTemplateService,
    DocumentProcessingService,
    EmbeddingService,
    RagService
  ],
  exports: [KnowledgeService, EmbeddingService, RagService],
})
export class KnowledgeModule {}
