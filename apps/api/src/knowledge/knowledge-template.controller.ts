import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { AdminGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { KnowledgeTemplateService } from './knowledge-template.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';

@ApiTags('Knowledge Templates')
@Controller('knowledge-templates')
@ApiBearerAuth()
export class KnowledgeTemplateController {
  constructor(private readonly svc: KnowledgeTemplateService) {}

  // 任意登录租户可见系统模板（全局，不含 tenantId 过滤）
  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiOperation({ summary: 'List active knowledge templates (system)' })
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiOperation({ summary: 'View a template' })
  get(@Param('id') id: string) {
    return this.svc.getById(id);
  }

  // 模板原件仅 admin 可维护
  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard, AdminGuard)
  @ApiOperation({ summary: 'Create template (admin only)' })
  create(@Body() dto: CreateTemplateDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, TenantGuard, AdminGuard)
  @ApiOperation({ summary: 'Update template (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, TenantGuard, AdminGuard)
  @ApiOperation({ summary: 'Delete template (admin only)' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  // 普通租户“使用模板”→ 复制到自己租户知识库
  @Post(':id/use')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiOperation({ summary: 'Copy template into current tenant knowledge base' })
  use(@Param('id') id: string, @CurrentUser() user: User, @Body() body: { botId?: string }) {
    return this.svc.useTemplate(id, user.tenantId, body?.botId);
  }
}
