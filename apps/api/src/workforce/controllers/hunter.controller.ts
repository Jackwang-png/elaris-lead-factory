import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { HunterService } from '../services/hunter.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import { HunterQualifiedDto } from '../dto/hunter.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Hunter')
@Controller('api/v2/hunter')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class HunterController {
  constructor(private readonly hunterService: HunterService) {}

  /** Hunter 判定 Qualified Lead → 创建 Customer + Conversation（Hunter→Support 交接点） */
  @Post('qualified')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequireScope('hunter:write', 'service:hunter')
  @ApiOperation({ summary: 'Hunter 判定 Qualified Lead（创建 Customer + Conversation，携带完整上下文）' })
  async qualified(
    @Body() dto: HunterQualifiedDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.hunterService.qualified(ctx.tenantId, dto, ctx, false);
  }

  /** 显式交接（复用 qualified 逻辑，action 记录为 HUNTER_HANDOFF） */
  @Post('handoff')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequireScope('hunter:write', 'service:hunter')
  @ApiOperation({ summary: 'Hunter 显式交接至 Support（复用 qualified 逻辑）' })
  async handoff(
    @Body() dto: HunterQualifiedDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.hunterService.qualified(ctx.tenantId, dto, ctx, true);
  }
}
