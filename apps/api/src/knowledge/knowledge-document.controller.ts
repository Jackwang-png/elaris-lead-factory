import { Controller, Get, Post, Body, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { RagService } from './rag.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@ApiTags('Knowledge Documents')
@Controller('knowledge/documents')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class KnowledgeDocumentController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  @ApiOperation({ summary: 'Create document knowledge' })
  async create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: User
  ) {
    try {
      return await this.ragService.createDocumentKnowledge({
        ...createDocumentDto,
        tenantId: user.tenantId,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create document knowledge',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all document knowledge' })
  async findAll(
    @CurrentUser() user: User,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('botId') botId?: string,
  ) {
    try {
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const where: any = { tenantId: user.tenantId, type: 'document' };

      if (botId) {
        where.botId = botId;
      }

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (category) {
        where.category = category;
      }

      const [items, total] = await Promise.all([
        this.ragService['prisma'].knowledgeDocument.findMany({
          where,
          skip,
          take: parseInt(limit),
          orderBy: { createdAt: 'desc' },
        }),
        this.ragService['prisma'].knowledgeDocument.count({ where }),
      ]);

      return { items, total };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch document knowledge',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
