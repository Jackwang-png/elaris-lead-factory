import { Controller, Get, Post, Body, Query, UseGuards, HttpException, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Leads')
@Controller('leads')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all leads' })
  async list(
    @CurrentUser() user: User,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('score') score?: string
  ) {
    try {
      return await this.leadsService.list({
        page: parseInt(page),
        limit: parseInt(limit),
        search,
        status,
        score,
        tenantId: user.tenantId
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch leads',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  async create(@Body() createLeadDto: CreateLeadDto, @CurrentUser() user: User) {
    try {
      if (!createLeadDto.botId) {
        throw new HttpException('botId is required', HttpStatus.BAD_REQUEST);
      }
      return await this.leadsService.create({
        ...createLeadDto,
        tenantId: user.tenantId,
        botId: createLeadDto.botId
      });
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to create lead',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
