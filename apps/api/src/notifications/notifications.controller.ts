import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Notifications 通知')
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: '获取通知列表' })
  async list(@Req() req, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.notificationsService.list(req.tenantId, parseInt(page), parseInt(limit));
  }

  @Get('unread-count')
  @ApiOperation({ summary: '获取未读通知数量' })
  async unreadCount(@Req() req) {
    return this.notificationsService.unreadCount(req.tenantId);
  }
}
