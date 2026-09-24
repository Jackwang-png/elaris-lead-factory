import { Injectable } from '@nestjs/common';
import { AiProviderRegistry } from '../ai/providers/ai-provider.registry';

/**
 * P0-5B.1 migration: embeddings now go through AiProviderRegistry (no bare
 * OpenAI client outside the adapter). Model selection is configuration-driven
 * (AI_EMBEDDING_MODEL, default text-embedding-ada-002 — the pre-existing
 * default). The zero-vector fallback on failure is PRE-EXISTING behavior and
 * is preserved: the embedding column is not used for real vector search today
 * (semanticSearch is a recent-items fallback), so a zero vector has no
 * business impact. Knowledge/RAG rework is explicitly out of scope (report §6).
 */
@Injectable()
export class EmbeddingService {
  constructor(private readonly registry: AiProviderRegistry) {}

  async generateEmbedding(text: string): Promise<string> {
    try {
      const result = await this.registry.getDefault().embed({ input: text });
      if (!result.success || !result.data) {
        console.error('Embedding failed:', result.error?.message);
        // Pre-existing fallback behavior (zero vector, 1536 dims).
        return JSON.stringify(Array(1536).fill(0));
      }
      return JSON.stringify(result.data);
    } catch (error) {
      console.error('Error generating embedding:', error);
      // Pre-existing fallback behavior (zero vector, 1536 dims).
      return JSON.stringify(Array(1536).fill(0));
    }
  }
}
