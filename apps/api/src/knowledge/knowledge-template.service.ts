import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from './knowledge.service';
import { CreateTemplateDto, UpdateTemplateDto, TemplateItemDto } from './dto/create-template.dto';

@Injectable()
export class KnowledgeTemplateService {
  constructor(
    private prisma: PrismaService,
    private knowledgeService: KnowledgeService,
  ) {}

  async list() {
    return this.prisma.knowledgeTemplate.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async getById(id: string) {
    const t = await this.prisma.knowledgeTemplate.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async create(dto: CreateTemplateDto) {
    return this.prisma.knowledgeTemplate.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        items: { create: dto.items.map((it, i) => this.mapItem(it, i)) },
      },
      include: { items: true },
    });
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.items) {
      data.items = {
        deleteMany: {},
        create: dto.items.map((it, i) => this.mapItem(it, i)),
      };
    }
    return this.prisma.knowledgeTemplate.update({
      where: { id },
      data,
      include: { items: true },
    });
  }

  async remove(id: string) {
    return this.prisma.knowledgeTemplate.delete({ where: { id } });
  }

  /**
   * 复制模板到当前租户知识库：每条 item 生成一条独立 Knowledge（新 id、tenantId=当前租户）。
   * 与系统模板原件完全独立，复制后修改/删除不影响模板，也不影响其他租户。
   */
  async useTemplate(id: string, tenantId: string, botId?: string) {
    const t = await this.getById(id);
    const created: any[] = [];
    for (const it of t.items) {
      const k = await this.knowledgeService.create({
        title: it.title,
        content: it.content,
        type: it.type,
        category: it.category || t.category || 'general',
        tenantId,
        botId,
        channels: it.channels,
      });
      created.push(k);
    }
    return { count: created.length, items: created };
  }

  private mapItem(it: TemplateItemDto, i: number) {
    return {
      title: it.title,
      content: it.content,
      type: it.type || 'general',
      category: it.category,
      channels: it.channels || [],
      sortOrder: it.sortOrder ?? i,
    };
  }
}
