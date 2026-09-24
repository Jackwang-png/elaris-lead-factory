import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Get,
  Query,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DouyinService } from './douyin.service';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSecurityService } from '../channel/webhook-security.service';

/**
 * 抖音开放平台回调控制器。
 *
 * P0-5A 安全修复：
 *   - POST 验签强制：SmartCS 自定义共享密钥 HMAC
 *     sign = HMAC-SHA256(DOUYIN_WEBHOOK_SECRET, `${timestamp}|${nonce}|${rawBody}`)
 *     （平台回调协议未在代码中实现；接入真实平台时按平台协议替换——不伪造安全完成）
 *   - tenant 身份只来自服务端映射（DOUYIN_WEBHOOK_TENANT_ID），删除 query.tenantId 信任
 *   - accountId 必须属于该 tenant（douyinAccountService.getAccountById 已按 tenantId 过滤）
 *   - 防重放：nonce 去重 + timestamp 新鲜度
 */
@Controller('douyin')
export class DouyinController {
  constructor(
    private readonly douyinService: DouyinService,
    private readonly security: WebhookSecurityService,
  ) {}

  @Post('webhook/:accountId')
  @HttpCode(HttpStatus.OK)
  @Public()
  async webhook(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
    @Param('accountId') accountId: string,
  ) {
    // 1) HMAC 验签（timestamp|nonce|rawBody）
    const v = this.security.verifyHmac(body || {}, 'DOUYIN_WEBHOOK_SECRET', (req as any).rawBody);
    if (!v.ok) {
      return res.status(v.status).json({ code: v.status, msg: v.reason });
    }

    // 2) tenant 身份：服务端映射（不再信任 query.tenantId）
    const tenantId = this.security.resolveTenantId('douyin');
    if (!tenantId) {
      return res.status(503).json({
        code: 503,
        msg: 'douyin webhook not configured (DOUYIN_WEBHOOK_TENANT_ID missing)',
      });
    }

    // 3) 防重放
    const replay = this.security.markReplay(`douyin|${body?.nonce}`);
    if (!replay.ok) {
      return res.status(replay.status).json({ code: replay.status, msg: replay.reason });
    }

    try {
      // 4) accountId 归属（tenant 过滤在 douyinAccountService 内）
      const response = await this.douyinService.processMessage(body, accountId, tenantId);
      return res.json({ response });
    } catch (e: any) {
      if (e?.status === 404) {
        return res.status(404).json({ code: 404, msg: e?.message || 'account not found' });
      }
      throw e;
    }
  }

  // 抖音开放平台 URL 验证回显（仅证明 URL 归属，无数据访问）
  @Get('verify/:appId')
  @Public()
  async verify(
    @Query('echostr') echostr: string,
    @Res() res: Response,
  ) {
    return res.send(echostr || 'ok');
  }
}
