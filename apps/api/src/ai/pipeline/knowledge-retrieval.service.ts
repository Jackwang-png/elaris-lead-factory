import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../knowledge/embedding.service';

@Injectable()
export class KnowledgeRetrievalService {
  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService,
  ) {}

  async retrieveKnowledge(keywords: string[], tenantId: string, channel?: string) {
    // First try to find exact matches
    const exactMatches = await this.findExactMatches(keywords, tenantId, channel);

    if (exactMatches.length >= 5) {
      return exactMatches;
    }

    // If not enough exact matches, try semantic search
    const semanticMatches = await this.semanticSearch(keywords.join(' '), tenantId, channel);

    // Combine and deduplicate results
    const combinedResults = [...exactMatches, ...semanticMatches];
    const uniqueResults = this.deduplicateResults(combinedResults);

    return uniqueResults.slice(0, 5);
  }

  private async findExactMatches(keywords: string[], tenantId: string, channel?: string) {
    const where: any = {
      tenantId,
      OR: keywords.map(keyword => ({
        OR: [
          { title: { contains: keyword, mode: 'insensitive' } },
          { content: { contains: keyword, mode: 'insensitive' } },
        ],
      })),
    };

    const knowledgeItems = await this.prisma.knowledge.findMany({
      where,
      take: 5,
    });

    return knowledgeItems;
  }

  private async semanticSearch(query: string, tenantId: string, channel?: string) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // In a real implementation, you would use vector similarity search here
      // For now, we'll just return recent knowledge items
      return this.prisma.knowledge.findMany({
        where: {
          tenantId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 5,
      });
    } catch (error) {
      console.error('Error in semantic search:', error);
      return [];
    }
  }

  private deduplicateResults(results: any[]) {
    const seen = new Set();
    return results.filter(result => {
      const key = result.id;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}
