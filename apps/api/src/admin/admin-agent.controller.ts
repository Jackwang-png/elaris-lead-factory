import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { AdminAgentService } from './admin-agent.service';
import { AdminAgentAskDto } from './admin-agent-ask.dto';

@ApiTags('Admin 智能助手')
@Controller('admin/agent')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AdminAgentController {
  constructor(private readonly svc: AdminAgentService) {}

  @Post('ask')
  @ApiOperation({ summary: '管理员智能助手：信息/建议/执行（三类分离）' })
  ask(@Body() dto: AdminAgentAskDto, @CurrentUser() user: User, @Req() req: any) {
    return this.svc.ask(dto, user.id, {
      ip: req?.ip,
      userAgent: req?.headers?.['user-agent'],
    });
  }
}
