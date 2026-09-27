import { Controller, Get, Post, Body, Put, Param, Delete, Query, UseGuards, HttpException, HttpStatus, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { KnowledgeService } from './knowledge.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';


const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@ApiTags('Knowledge')
@Controller('knowledge')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post()
  @ApiOperation({ summary: 'Create knowledge' })
  async create(
    @Body() createKnowledgeDto: CreateKnowledgeDto & { channels?: string[] },
    @CurrentUser() user: User
  ) {
    try {
      return await this.knowledgeService.create({
        ...createKnowledgeDto,
        tenantId: user.tenantId,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create knowledge',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload file as knowledge (txt/md/pdf/docx)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string' },
        botId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { category?: string; botId?: string },
    @CurrentUser() user: User
  ) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }
    try {
      const content = await this.extractText(file);
      if (!content || content.trim().length < 10) {
        throw new BadRequestException('无法从文件中提取有效内容');
      }
      const title = file.originalname.replace(/\.(txt|md|pdf|docx)$/i, '');
      return await this.knowledgeService.create({
        title,
        content: content.slice(0, 50000),
        type: 'document',
        category: body.category || 'document',
        tenantId: user.tenantId,
        botId: body.botId,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        '文件解析失败: ' + (error.message || error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async extractText(file: Express.Multer.File): Promise<string> {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const tmpPath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    fs.writeFileSync(tmpPath, file.buffer);

    try {
      switch (ext) {
        case '.txt':
        case '.md':
          return file.buffer.toString('utf-8');

        case '.pdf': {
          const text = execSync(`pdftotext "${tmpPath}" - 2>/dev/null | head -c 500000`, {
            encoding: 'utf-8',
            maxBuffer: 2 * 1024 * 1024,
          });
          return text || '';
        }

        case '.docx': {
          // 用 unzip 提取 word/document.xml 再剥标签
          const xml = execSync(`unzip -p "${tmpPath}" word/document.xml 2>/dev/null | head -c 3000000`, {
            encoding: 'utf-8',
            maxBuffer: 5 * 1024 * 1024,
          });
          return xml
            .replace(/<w:p[^>]*>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        }

        default:
          throw new Error(`不支持的文件类型: ${ext || '未知'}（支持 txt/md/pdf/docx）`);
      }
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get all knowledge' })
  async findAll(
    @CurrentUser() user: User,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('type') type?: string,
    @Query('channel') channel?: string,
  ) {
    try {
      return await this.knowledgeService.findAll(
        user.tenantId,
        parseInt(page),
        parseInt(limit),
        type,
        channel
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch knowledge',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('search')
  @ApiOperation({ summary: 'Search knowledge' })
  async search(
    @CurrentUser() user: User,
    @Query('query') query: string,
    @Query('channel') channel?: string,
  ) {
    try {
      return await this.knowledgeService.search(query, user.tenantId, channel);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to search knowledge',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get knowledge by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      const knowledge = await this.knowledgeService.findOne(id, user.tenantId);
      if (!knowledge) {
        throw new HttpException('Knowledge not found', HttpStatus.NOT_FOUND);
      }
      return knowledge;
    } catch (error) {
      // 已构造的 HttpException（如 404）原样透传，避免被重包成 500
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to fetch knowledge',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update knowledge' })
  async update(
    @Param('id') id: string,
    @Body() updateKnowledgeDto: UpdateKnowledgeDto & { channels?: string[] },
    @CurrentUser() user: User,
  ) {
    try {
      return await this.knowledgeService.update(id, {
        ...updateKnowledgeDto,
        tenantId: user.tenantId,
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update knowledge',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete knowledge' })
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    try {
      return await this.knowledgeService.remove(id, user.tenantId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to delete knowledge',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
