import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WidgetService } from './widget.service';

/**
 * 客户侧 widget 公开接口（无 JWT）。
 * 生产：widget.wan-wan.xyz 静态页 → 此处（api.wan-wan.xyz）。
 */
@ApiTags('Widget 客服组件')
@Controller('widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Post('chat')
  @ApiOperation({ summary: '客户发消息（AI 自动回复；无法回答时转人工）' })
  chat(@Body() body: { botId?: string; visitorId?: string; message?: string }) {
    return this.widgetService.chat(body?.botId, body?.visitorId, body?.message);
  }

  @Get('history')
  @ApiOperation({ summary: '客户回读会话历史（含人工客服回复）' })
  history(
    @Query('conversationId') conversationId?: string,
    @Query('visitorId') visitorId?: string,
  ) {
    return this.widgetService.history(conversationId, visitorId);
  }
}
