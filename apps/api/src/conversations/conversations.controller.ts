import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all conversations' })
  findAll(@Req() req) {
    return this.service.findAll(req.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  findOne(@Param('id') id: string, @Req() req) {
    return this.service.findOne(id, req.tenantId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add message to conversation' })
  addMessage(@Param('id') id: string, @Body() body: { content?: string }, @Req() req) {
    // P0-5A：修复参数错位——(conversationId, content, tenantId)，
    // tenantId 只来自可信 JWT context，不来自 body
    return this.service.addMessage(id, body?.content || '', req.tenantId);
  }
}
