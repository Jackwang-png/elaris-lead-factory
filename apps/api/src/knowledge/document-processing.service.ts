import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class DocumentProcessingService {
  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  async processDocument(params: {
    documentId: string;
    content: string;
    tenantId: string;
    botId?: string;
  }) {
    const { documentId, content, tenantId, botId } = params;

    // Split document into chunks
    const chunks = this.chunkDocument(content);

    // Process each chunk
    const chunkRecords = await Promise.all(
      chunks.map(async (chunk, index) => {
        // Generate embedding for the chunk
        const embedding = await this.embeddingService.generateEmbedding(chunk);

        return {
          content: chunk,
          embedding,
          documentId,
          tenantId,
          botId,
          chunkIndex: index,
          tokenCount: this.countTokens(chunk),
        };
      }),
    );

    // Store chunks in database
    await this.prisma.knowledgeChunk.createMany({
      data: chunkRecords,
      skipDuplicates: true,
    });

    return chunkRecords;
  }

  private chunkDocument(content: string, chunkSize = 1000): string[] {
    const chunks: string[] = [];
    const words = content.split(/\s+/);

    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      chunks.push(chunk);
    }

    return chunks;
  }

  private countTokens(text: string): number {
    return text.split(/\s+/).length;
  }

  async searchChunks(params: {
    query: string;
    tenantId: string;
    botId?: string;
    limit?: number;
  }) {
    const { query, tenantId, botId, limit = 5 } = params;

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Build where clause
    const where: any = { tenantId };
    if (botId) {
      where.botId = botId;
    }

    // Find similar chunks using vector search
    // Note: In a real implementation, this would use pgvector's <=> operator
    // This is a simplified version for demonstration
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' }, // Placeholder for similarity ordering
    });

    // In a real implementation, we would calculate similarity here
    return chunks.map(chunk => ({
      ...chunk,
      similarity: 0.9, // Placeholder similarity score
    }));
  }
}
