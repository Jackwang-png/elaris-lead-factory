import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { QueryAuditDto } from './dto/query-audit.dto';

@ApiTags('Audit 审计日志')
@Controller('audit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: '查询审计日志（当前租户）' })
  async list(
    @CurrentUser() user: User,
    @Query() query: QueryAuditDto,
  ) {
    return this.auditService.query({
      ...query,
      tenantId: user.tenantId,
    });
  }
}
