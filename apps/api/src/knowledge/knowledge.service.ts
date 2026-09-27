import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
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

    return this.findOne(knowledge.id, createKnowledgeDto.tenantId);
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

  async findOne(id: string, tenantId: string) {
    const knowledge = await this.prisma.knowledge.findFirst({
      where: { id, tenantId },
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
      channels: (knowledge.channels || []).map(c => c.channel)
    };
  }

  async update(id: string, updateKnowledgeDto: UpdateKnowledgeDto & { tenantId: string; channels?: string[] }) {
    // 强制按 id + tenantId 过滤，杜绝跨租户篡改
    const knowledge = await this.prisma.knowledge.update({
      where: { id, tenantId: updateKnowledgeDto.tenantId },
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

    return this.findOne(id, updateKnowledgeDto.tenantId);
  }

  async remove(id: string, tenantId: string) {
    // 先校验归属，跨租户一律 404（不泄露存在性）
    const exists = await this.prisma.knowledge.findFirst({ where: { id, tenantId } });
    if (!exists) {
      throw new NotFoundException('Knowledge not found');
    }

    // Delete channel associations first
    await this.prisma.knowledgeChannel.deleteMany({
      where: { knowledgeId: id }
    });

    // Delete embedding
    await this.prisma.knowledgeEmbedding.deleteMany({
      where: { knowledgeId: id }
    });

    // Then delete the knowledge item（显式带上 tenantId，纵深防御）
    return this.prisma.knowledge.delete({
      where: { id, tenantId }
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
