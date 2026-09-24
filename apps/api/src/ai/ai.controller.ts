import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI sales chat' })
  async chat(
    @Body() body: {
      message: string;
      customerId?: string;
      conversationId: string;
      channel?: string
    },
    @Req() req
  ) {
    const response = await this.aiService.processMessage(
      req.tenantId,
      '', // botId - not used in current implementation
      body.conversationId,
      body.message,
      body.customerId,
      body.channel
    );

    return { response: response.response };
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze customer intent' })
  async analyze(
    @Body() body: {
      message: string;
      customerId?: string;
      conversationId: string;
      channel?: string
    },
    @Req() req
  ) {
    // For analysis, we'll just process the message and return insights
    const response = await this.aiService.processMessage(
      req.tenantId,
      '', // botId - not used in current implementation
      body.conversationId,
      body.message,
      body.customerId,
      body.channel
    );

    // getCustomerInsights method doesn't exist, return empty insights
    return {
      response: response.response,
      insights: {}
    };
  }

  @Post('insights')
  @ApiOperation({ summary: 'Get customer insights' })
  async getCustomerInsights(
    @Body() body: { customerId: string },
    @Req() req
  ) {
    // getCustomerInsights method doesn't exist, return empty insights
    return {};
  }
}
