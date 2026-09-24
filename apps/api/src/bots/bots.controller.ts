import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BotsService } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('Bots')
@Controller('bots')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new bot' })
  async create(@Body() createBotDto: CreateBotDto, @Req() req: any) {
    const tenantId = req.tenantId;
    return await this.botsService.create(tenantId, createBotDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bots' })
  async findAll(@Req() req: any) {
    const tenantId = req.tenantId;
    return await this.botsService.findAll(tenantId);
  }
}
