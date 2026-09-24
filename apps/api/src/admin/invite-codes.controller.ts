import { Controller, Get, Post, Body, Query, Param, UseGuards, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { InviteCodesService } from './invite-codes.service';

/**
 * L2: 注册邀请码管理接口。
 * 鉴权走 admin key（PAYMENT_ADMIN_KEY / REGISTER_ADMIN_KEY），
 * 由 AdminKeyGuard 统一校验（X-Admin-Key 请求头优先，query/body key 向后兼容；
 * 每次尝试写审计日志；ADMIN_KEY_STRICT=true 时仅接受请求头）。
 */
@ApiTags('Admin 邀请码管理')
@Controller('admin/invite-codes')
@UseGuards(JwtAuthGuard, AdminKeyGuard)
export class InviteCodesController {
  constructor(private readonly inviteCodesService: InviteCodesService) {}

  /** 生成邀请码（count 批量 / maxUses 可多次 / expiresInDays 有效天数 / remark 备注） */
  @Public()
  @Post()
  @ApiOperation({ summary: '生成邀请码（需 admin key）' })
  generate(
    @Body()
    body: {
      count?: number;
      maxUses?: number;
      remark?: string;
      expiresInDays?: number;
      key?: string;
    },
    @Query('key') queryKey?: string,
    @Headers('x-admin-key') headerKey?: string,
  ) {
    return this.inviteCodesService.generate(body, body?.key || queryKey || headerKey);
  }

  /** 邀请码列表 */
  @Public()
  @Get()
  @ApiOperation({ summary: '邀请码列表（需 admin key）' })
  list(@Query('key') key?: string, @Headers('x-admin-key') headerKey?: string) {
    return this.inviteCodesService.list(key || headerKey);
  }

  /** 停用邀请码（置 expiresAt=now） */
  @Public()
  @Post(':code/revoke')
  @ApiOperation({ summary: '停用邀请码（需 admin key）' })
  revoke(
    @Param('code') code: string,
    @Body() body: { key?: string },
    @Query('key') queryKey?: string,
    @Headers('x-admin-key') headerKey?: string,
  ) {
    return this.inviteCodesService.revoke(code, body?.key || queryKey || headerKey);
  }
}
