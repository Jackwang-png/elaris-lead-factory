import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { EmbeddingService } from './embedding.service';

@Injectable()
export class KnowledgeService {
  constructor(
    private prisma: PrismaService,
    private embeddingService: EmbeddingService
  ) {}

  async create(createKnowledgeDto: CreateKnowledgeDto & { tenantId: string; channels?: string[] }) {
    // Create the knowledge item
    const knowledge = await this.prisma.knowledge.create({
      data: {
        title: createKnowledgeDto.title,
        content: createKnowledgeDto.content,
        type: createKnowledgeDto.type,
        category: createKnowledgeDto.category,
        tenantId: createKnowledgeDto.tenantId
      }
    });

    // Generate embedding
    await this.generateEmbedding(knowledge.id, knowledge.content);

    // If channels are specified, create channel associations
    if (createKnowledgeDto.channels && createKnowledgeDto.channels.length > 0) {
      await this.prisma.knowledgeChannel.createMany({
        data: createKnowledgeDto.channels.map(channel => ({
          knowledgeId: knowledge.id,
          channel,
          tenantId: createKnowledgeDto.tenantId
        })),
        skipDuplicates: true
      });
    }

    return this.findOne(knowledge.id);
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 10, type?: string, channel?: string) {
    const skip = (page - 1) * limit;
    const where: any = { tenantId };

    if (type) where.type = type;

    const [knowledgeItems, total] = await Promise.all([
      this.prisma.knowledge.findMany({
        where,
        skip,
        take: limit,
        include: {
          channels: {
            select: {
              channel: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      this.prisma.knowledge.count({ where })
    ]);

    // Filter by channel if specified
    let filteredItems = knowledgeItems;

    if (channel) {
      filteredItems = knowledgeItems.filter(item =>
        item.channels.some(c => c.channel === channel) ||
        item.channels.length === 0 // Include items with no channel restrictions
      );
    }

    return {
      data: filteredItems.map(item => ({
        ...item,
        channels: item.channels.map(c => c.channel)
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findOne(id: string) {
    const knowledge = await this.prisma.knowledge.findUnique({
      where: { id },
      include: {
        channels: {
          select: {
            channel: true
          }
        },
        embeddings: true
      }
    });

    if (!knowledge) {
      return null;
    }

    return {
      ...knowledge,
      channels: knowledge.channels.map(c => c.channel)
    };
  }

  async update(id: string, updateKnowledgeDto: UpdateKnowledgeDto & { tenantId: string; channels?: string[] }) {
    // Update the knowledge item
    const knowledge = await this.prisma.knowledge.update({
      where: { id },
      data: {
        title: updateKnowledgeDto.title,
        content: updateKnowledgeDto.content,
        type: updateKnowledgeDto.type,
        category: updateKnowledgeDto.category
      }
    });

    // Generate new embedding
    await this.generateEmbedding(id, updateKnowledgeDto.content || knowledge.content);

    // Update channel associations if provided
    if (updateKnowledgeDto.channels) {
      // Delete existing associations
      await this.prisma.knowledgeChannel.deleteMany({
        where: { knowledgeId: id }
      });

      // Create new associations
      if (updateKnowledgeDto.channels.length > 0) {
        await this.prisma.knowledgeChannel.createMany({
          data: updateKnowledgeDto.channels.map(channel => ({
            knowledgeId: id,
            channel,
            tenantId: updateKnowledgeDto.tenantId
          })),
          skipDuplicates: true
        });
      }
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    // Delete channel associations first
    await this.prisma.knowledgeChannel.deleteMany({
      where: { knowledgeId: id }
    });

    // Delete embedding
    await this.prisma.knowledgeEmbedding.deleteMany({
      where: { knowledgeId: id }
    });

    // Then delete the knowledge item
    return this.prisma.knowledge.delete({
      where: { id }
    });
  }

  async search(query: string, tenantId: string, channel?: string) {
    const knowledgeItems = await this.prisma.knowledge.findMany({
      where: {
        tenantId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } }
        ]
      },
      include: {
        channels: {
          select: {
            channel: true
          }
        }
      }
    });

    // Filter by channel if specified
    let filteredItems = knowledgeItems;

    if (channel) {
      filteredItems = knowledgeItems.filter(item =>
        item.channels.some(c => c.channel === channel) ||
        item.channels.length === 0 // Include items with no channel restrictions
      );
    }

    return filteredItems.map(item => ({
      ...item,
      channels: item.channels.map(c => c.channel)
    }));
  }

  private async generateEmbedding(knowledgeId: string, content: string) {
    try {
      // Generate embedding
      const embedding = await this.embeddingService.generateEmbedding(content);

      // Upsert embedding
      await this.prisma.knowledgeEmbedding.upsert({
        where: { knowledgeId },
        create: {
          knowledgeId,
          embedding
        },
        update: {
          embedding
        }
      });
    } catch (error) {
      console.error(`Error generating embedding for knowledge ${knowledgeId}:`, error);
    }
  }
}
