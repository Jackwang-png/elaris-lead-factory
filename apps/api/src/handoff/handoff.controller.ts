import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { HandoffService } from './handoff.service';

/**
 * 转人工客服（Human Handoff）管理接口。
 * 鉴权：JWT + 租户隔离。管理员/商家登录后可见待处理列表并回复。
 */
@ApiTags('人工客服转接')
@Controller('handoff')
@UseGuards(JwtAuthGuard, TenantGuard, new RolesGuard(['merchant', 'CUSTOMER_SERVICE']))
@ApiBearerAuth()
export class HandoffController {
  constructor(private readonly handoffService: HandoffService) {}

  @Get('pending')
  @ApiOperation({ summary: '待人工处理的会话列表（?mine=1 仅返回我认领的或待认领的）' })
  pending(@Req() req, @Query('mine') mine?: string) {
    const onlyMine = mine === '1' || mine === 'true';
    return this.handoffService.listPending(
      req.tenantId,
      onlyMine ? { mine: true, userId: req.user?.id } : {},
    );
  }

  @Post(':id/claim')
  @ApiOperation({ summary: '认领会话（员工开始处理）' })
  claim(@Param('id') id: string, @Req() req) {
    return this.handoffService.claim(id, req.tenantId, req.user?.id);
  }

  @Get('pending-count')
  @ApiOperation({ summary: '待处理会话数量' })
  async pendingCount(@Req() req) {
    return { count: await this.handoffService.pendingCount(req.tenantId) };
  }

  @Post(':id/reply')
  @ApiOperation({ summary: '人工客服回复（写入 agent 消息并标记已处理）' })
  reply(@Param('id') id: string, @Body() body: { content?: string }, @Req() req) {
    return this.handoffService.reply(id, req.tenantId, body?.content, req.user?.id, req.user?.role);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: '标记已处理（不回复）' })
  resolve(@Param('id') id: string, @Req() req) {
    return this.handoffService.resolve(id, req.tenantId, req.user?.id, req.user?.role);
  }
}
