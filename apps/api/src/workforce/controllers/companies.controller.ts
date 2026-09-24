import { Controller, Get, Post, Body, Query, Param, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CompanyService } from '../services/company.service';
import { WorkforceTenantGuard } from '../workforce-tenant.guard';
import { WorkforceThrottlerGuard } from '../workforce-throttler.guard';
import { WorkforceTenant, RequireScope } from '../workforce.decorators';
import { CreateCompanyDto, QueryCompaniesDto } from '../dto/lead.dto';
import { WorkforceContext } from '../workforce.types';

@ApiTags('Workforce v2 · Companies')
@Controller('api/v2/companies')
@UseGuards(WorkforceTenantGuard, WorkforceThrottlerGuard)
@ApiBearerAuth()
export class CompaniesController {
  constructor(private readonly companyService: CompanyService) {}

  @Post()
  @HttpCode(201)
  @RequireScope('companies:write', 'service:scout')
  @ApiOperation({ summary: '创建 Company（normalizedName 自动生成）' })
  async create(
    @Body() dto: CreateCompanyDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.companyService.create(ctx.tenantId, dto, ctx);
  }

  @Get()
  @RequireScope('companies:read')
  @ApiOperation({ summary: 'Company 列表' })
  async list(
    @Query() query: QueryCompaniesDto,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.companyService.list(ctx.tenantId, query as any);
  }

  @Get(':id')
  @RequireScope('companies:read')
  @ApiOperation({ summary: 'Company 详情（含 leads/signals/opportunities）' })
  async getById(
    @Param('id') id: string,
    @WorkforceTenant() ctx: WorkforceContext,
  ) {
    return this.companyService.getById(ctx.tenantId, id);
  }
}
