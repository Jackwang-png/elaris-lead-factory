import { Controller, Post, Get, Query, Body, Res, Req } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { WechatService } from './wechat.service';
import { Public } from '../common/decorators/public.decorator';
import { WebhookSecurityService } from '../channel/webhook-security.service';

/**
 * 微信公众号回调。
 *
 * P0-5A 安全修复：
 *   - GET URL 验证：官方协议 sha1(sort(token,timestamp,nonce)) 验签（无 token → 503）
 *   - POST 消息：安全模式（Encrypt+msg_signature）验签；明文模式平台无逐条签名，
 *     默认拒绝（需 WECHAT_WEBHOOK_PLAINTEXT_ALLOWED=true 显式开启，残留风险记录）
 *   - tenant 身份只来自服务端映射（WECHAT_WEBHOOK_TENANT_ID），不读 body/query 自报值
 *   - bot 只来自服务端配置（WECHAT_WEBHOOK_BOT_ID / DEFAULT_WECHAT_BOT_ID），
 *     且必须属于该 tenant（伪造 bot → 403）
 *   - 防重放：MsgId 事件 key 去重（重复消息 → 401）
 */
@Controller('wechat')
export class WechatController {
  constructor(
    private readonly wechatService: WechatService,
    private readonly security: WebhookSecurityService,
    private readonly config: ConfigService,
  ) {}

  // 微信服务器 URL 验证（GET，官方签名协议）
  @Public()
  @Get()
  verify(
    @Query() query: Record<string, any>,
    @Res() res: Response,
  ) {
    const r = this.security.verifyWechatGet(query || {});
    if (!r.ok) {
      return res.status(r.status).send(r.reason);
    }
    return res.send(query.echostr || 'ok');
  }

  // 微信消息回调（POST，返回 XML）
  @Public()
  @Post()
  async message(
    @Body() body: any,
    @Res() res: Response,
  ) {
    const v = this.security.verifyWechatPost(body || {});
    if (!v.ok) {
      return res.status(v.status).send(v.reason);
    }

    // tenant 身份：服务端映射
    const tenantId = this.security.resolveTenantId('wechat');
    if (!tenantId) {
      return res.status(503).send('wechat webhook not configured (WECHAT_WEBHOOK_TENANT_ID missing)');
    }

    // bot：服务端配置 + 归属校验（伪造 bot → 403）
    const botId =
      this.config.get<string>('WECHAT_WEBHOOK_BOT_ID') ||
      process.env.DEFAULT_WECHAT_BOT_ID ||
      '';
    if (!botId) {
      return res.status(503).send('wechat webhook not configured (WECHAT_WEBHOOK_BOT_ID missing)');
    }
    const botCheck = await this.security.assertBotOwnedByTenant(botId, tenantId);
    if (!botCheck.ok) {
      return res.status(botCheck.status).send(botCheck.reason);
    }

    // 防重放：MsgId 唯一
    const msgId = body?.MsgId || body?.CreateTime;
    const replay = this.security.markReplay(`wechat|${msgId}|${body?.FromUserName || ''}`);
    if (!replay.ok) {
      return res.status(replay.status).send(replay.reason);
    }

    const content = body?.Content || '';
    const fromUser = body?.FromUserName || '';
    const answer = await this.wechatService.reply(content, botId);

    const xml = `<xml>
  <ToUserName><![CDATA[${fromUser}]]></ToUserName>
  <FromUserName><![CDATA[${body?.ToUserName || ''}]]></FromUserName>
  <CreateTime>${Date.now()}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${answer}]]></Content>
</xml>`;

    res.header('Content-Type', 'text/xml');
    res.send(xml);
  }
}
