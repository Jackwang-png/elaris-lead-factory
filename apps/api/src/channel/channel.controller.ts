import { Controller, Post, Get, Body, Query, Res, Req, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ChannelService } from './channel.service';
import { WebhookSecurityService } from './webhook-security.service';

/**
 * 千牛/淘宝消息推送 Webhook（公开端点，无 JWT——由 TOP 签名验证）。
 *
 * P0-5A 安全修复：
 *   - 签名强制验证（无宽松模式；凭证缺失 → 503，签名错误/过期 → 401）
 *   - tenant 身份只来自服务端映射（TAOBAO_WEBHOOK_TENANT_ID），
 *     忽略 body/query 自报的 tenantId（伪造 tenant 注入 → 拒绝）
 *   - botId（query 传入）必须属于该 tenant（伪造 bot → 403）
 *   - 防重放：timestamp 新鲜度窗口 + 事件 key 去重（重复推送 → 401）
 */
@ApiTags('Channel Webhook')
@Controller('webhook')
export class ChannelWebhookController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly security: WebhookSecurityService,
  ) {}

  // GET 验证（千牛开放平台首次配置时要求回显；仅证明 URL 归属，无数据访问）
  @Get('taobao')
  @ApiOperation({ summary: '千牛 webhook 验证' })
  verify(@Query('echostr') echostr: string, @Res() res: Response) {
    return res.send(echostr || 'ok');
  }

  // POST 接收千牛/淘宝推送的买家消息（验签强制）
  @Post('taobao')
  @HttpCode(200)
  @ApiOperation({ summary: '千牛买家消息推送' })
  async receive(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      // 合并 query + body 作为完整推送参数（TOP 验签需要 topic/userId/timestamp/sign 等全部参数）
      const payload = { ...(req.query as Record<string, any>), ...(body || {}) };

      // 1) 签名 + 新鲜度（强制）
      const sig = this.security.verifyTaobao(payload);
      if (!sig.ok) {
        return res.status(sig.status).json({ code: sig.status, msg: sig.reason });
      }

      // 2) tenant 身份：服务端映射（不读 body.tenantId / query.tenantId）
      const tenantId = this.security.resolveTenantId('taobao');
      if (!tenantId) {
        return res.status(503).json({
          code: 503,
          msg: 'taobao webhook not configured (TAOBAO_WEBHOOK_TENANT_ID missing)',
        });
      }

      // 3) botId 归属校验（query 传入；伪造 bot → 403）
      const botId = (req.query.botId as string) || '';
      if (botId) {
        const botCheck = await this.security.assertBotOwnedByTenant(botId, tenantId);
        if (!botCheck.ok) {
          return res.status(botCheck.status).json({ code: botCheck.status, msg: botCheck.reason });
        }
      }

      // 4) 防重放：事件 key = topic|userId|ownerId|timestamp
      const replay = this.security.markReplay(
        `taobao|${payload.topic}|${payload.userId}|${payload.ownerId}|${payload.timestamp}`,
      );
      if (!replay.ok) {
        return res.status(replay.status).json({ code: replay.status, msg: replay.reason });
      }

      // 5) 统一渠道处理（验签已通过 → 转 AI + 回复）
      const result = await this.channelService.processIncomingMessage(
        'taobao',
        payload,
        botId,
        tenantId,
      );
      if (!result.ok) {
        if (!result.verified) {
          return res.status(401).json({ code: 401, msg: result.reason || 'signature verification failed' });
        }
        return res.json({ code: 1, msg: result.reason || 'message processing failed' });
      }
      return res.json({ code: 0, msg: 'ok', data: result });
    } catch (e) {
      return res.status(500).json({ code: 500, msg: (e as Error).message || 'error' });
    }
  }
}
