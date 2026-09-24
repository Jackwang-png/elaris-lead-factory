import { Injectable } from '@nestjs/common';
import { DocumentProcessingService } from './document-processing.service';
import { KnowledgeService } from './knowledge.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RagService {
  constructor(
    private documentProcessingService: DocumentProcessingService,
    private knowledgeService: KnowledgeService,
    private prisma: PrismaService,
  ) {}

  async retrieveContext(params: {
    query: string;
    tenantId: string;
    botId?: string;
    limit?: number;
  }) {
    const { query, tenantId, botId, limit = 5 } = params;

    // Search knowledge base
    const knowledgeResults = await this.knowledgeService.search(
      query,
      tenantId,
      botId,
    );

    // Search document chunks
    const chunkResults = await this.documentProcessingService.searchChunks({
      query,
      tenantId,
      botId,
      limit,
    });

    // Combine and deduplicate results
    const combinedResults = [
      ...knowledgeResults.map(k => ({
        id: k.id,
        content: k.content,
        type: 'knowledge',
        source: k.title,
        score: 1.0, // Placeholder score
      })),
      ...chunkResults.map(c => ({
        id: c.id,
        content: c.content,
        type: 'document',
        source: c.documentId,
        score: c.similarity,
      })),
    ];

    // Sort by score and limit
    const sortedResults = combinedResults.sort((a, b) => b.score - a.score);
    return sortedResults.slice(0, limit);
  }

  async createDocumentKnowledge(params: {
    title: string;
    content: string;
    tenantId: string;
    botId?: string;
    category?: string;
  }) {
    const { title, content, tenantId, botId, category } = params;

    // Create document record
    const document = await this.prisma.knowledgeDocument.create({
      data: {
        title,
        content,
        type: 'document',
        category,
        tenantId,
        botId,
      },
    });

    // Process document into chunks
    await this.documentProcessingService.processDocument({
      documentId: document.id,
      content,
      tenantId,
      botId,
    });

    return document;
  }
}
