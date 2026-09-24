import {
  Controller,
  Post,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ChannelService,
} from '../channel/channel.service';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSecurityService } from '../channel/webhook-security.service';

/**
 * 小红书开放平台回调控制器。
 *
 * P0-5A 安全修复：
 *   - POST 验签强制：SmartCS 自定义共享密钥 HMAC
 *     sign = HMAC-SHA256(XHS_WEBHOOK_SECRET, `${timestamp}|${nonce}|${rawBody}`)
 *     （平台回调协议未在代码中实现；接入真实平台时替换——不伪造安全完成）
 *   - tenant 身份只来自服务端映射（XHS_WEBHOOK_TENANT_ID），不读 body.tenantId
 *   - botId（body 传入）必须属于该 tenant（伪造 bot → 403）
 *   - 防重放：nonce 去重 + timestamp 新鲜度
 *   - 当前无 xiaohongshu ChannelAdapter 注册 → 验签通过后返回 503（渠道未实现）
 */
@Controller('xiaohongshu')
export class XiaohongshuController {
  constructor(
    private readonly channelService: ChannelService,
    private readonly security: WebhookSecurityService,
  ) {}

  @Post('webhook')
  @Public()
  async webhook(
    @Body() body: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    // 1) HMAC 验签
    const v = this.security.verifyHmac(body || {}, 'XHS_WEBHOOK_SECRET', (req as any).rawBody);
    if (!v.ok) {
      return res.status(v.status).json({ code: v.status, msg: v.reason });
    }

    // 2) tenant 身份：服务端映射（不读 body.tenantId）
    const tenantId = this.security.resolveTenantId('xiaohongshu');
    if (!tenantId) {
      return res.status(503).json({
        code: 503,
        msg: 'xiaohongshu webhook not configured (XHS_WEBHOOK_TENANT_ID missing)',
      });
    }

    // 3) botId 归属校验
    const botId = body?.botId || '';
    if (botId) {
      const botCheck = await this.security.assertBotOwnedByTenant(botId, tenantId);
      if (!botCheck.ok) {
        return res.status(botCheck.status).json({ code: botCheck.status, msg: botCheck.reason });
      }
    }

    // 4) 防重放
    const replay = this.security.markReplay(`xhs|${body?.nonce}`);
    if (!replay.ok) {
      return res.status(replay.status).json({ code: replay.status, msg: replay.reason });
    }

    // 5) 渠道处理（当前无 xiaohongshu adapter → 503 未实现）
    if (!this.channelService.getAdapter('xiaohongshu')) {
      return res
        .status(503)
        .json({ code: 503, msg: 'xiaohongshu channel adapter not implemented' });
    }
    const result = await this.channelService.processIncomingMessage(
      'xiaohongshu',
      { userId: body.userId, message: body.message },
      botId,
      tenantId,
    );
    if (!result.ok) {
      if (!result.verified) {
        return res.status(401).json({ code: 401, msg: result.reason || 'verification failed' });
      }
      return res.status(503).json({ code: 503, msg: result.reason || 'channel not configured' });
    }
    return res.json({ success: true });
  }
}
