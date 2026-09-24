import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelAdapter, ChannelMessage } from './channel.interface';

/**
 * 企业微信（WeCom）应用消息接入（真实实现）
 *
 * 需要配置环境变量（.env）：
 *   WECOM_CORP_ID    企业 ID（在管理后台「我的企业」查看）
 *   WECOM_AGENT_ID   自建应用 AgentId
 *   WECOM_SECRET     自建应用 Secret
 *
 * 发送链路（官方「应用消息」API）：
 *   1. GET  https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=..&corpsecret=..
 *      → { access_token, expires_in }（内存缓存，过期前复用）
 *   2. POST https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=..
 *      body: { touser, msgtype: "text", agentid, text: { content } }
 *
 * 凭证未配置时优雅降级：warn 日志 + 不发送不报错（与千牛 taobao.adapter 宽松模式一致）。
 * verifyWebhook 保持宽松（返回 true）：企业微信回调验签需 EncodingAESKey 解密，
 * 当前未接入回调场景，后续如需严格验签再按官方加解密规范补充。
 */
@Injectable()
export class WecomAdapter implements ChannelAdapter {
  readonly channelName = 'wecom';
  private readonly logger = new Logger(WecomAdapter.name);

  private static readonly API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';

  /** access_token 内存缓存（token + 过期时间戳），过期前 60s 提前刷新 */
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get corpId(): string {
    return this.config.get<string>('WECOM_CORP_ID') || '';
  }

  private get agentId(): string {
    return this.config.get<string>('WECOM_AGENT_ID') || '';
  }

  private get secret(): string {
    return this.config.get<string>('WECOM_SECRET') || '';
  }

  private get credentialsReady(): boolean {
    return !!(this.corpId && this.agentId && this.secret);
  }

  /**
   * 获取 access_token（带内存缓存）。
   * 凭证缺失 / 获取失败 → 返回 null（调用方降级，不抛异常）。
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.credentialsReady) {
      return null;
    }
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.token;
    }
    try {
      const url = `${WecomAdapter.API_BASE}/gettoken?corpid=${encodeURIComponent(this.corpId)}&corpsecret=${encodeURIComponent(this.secret)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const json: any = await res.json();
      if (json?.errcode !== 0 || !json?.access_token) {
        this.logger.error(
          `[企业微信] 获取 access_token 失败 errcode=${json?.errcode} errmsg=${json?.errmsg || ''}`,
        );
        return null;
      }
      const expiresIn = Number(json.expires_in) || 7200;
      this.tokenCache = {
        token: json.access_token,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      this.logger.log('[企业微信] access_token 已获取并缓存');
      return json.access_token;
    } catch (e) {
      this.logger.error(`[企业微信] 获取 access_token 异常: ${(e as Error).message}`);
      return null;
    }
  }

  async receiveMessage(): Promise<ChannelMessage | null> {
    // 消息通过企业微信回调推送，不使用轮询（回调接入待后续补充）
    return null;
  }

  /**
   * 把 AI 回复发送给企业微信用户（真实「应用消息」API）。
   * conversationId = 接收方企业微信成员 UserID（touser）。
   * 凭证未配齐 → 告警降级，不发送不报错。
   */
  async sendMessage(conversationId: string, content: string): Promise<void> {
    if (!this.credentialsReady) {
      this.logger.warn(
        `[企业微信] 凭证未配置（WECOM_CORP_ID/WECOM_AGENT_ID/WECOM_SECRET），消息未发送（降级）: ${content.slice(0, 30)}...`,
      );
      return;
    }
    const token = await this.getAccessToken();
    if (!token) {
      this.logger.warn('[企业微信] 无 access_token，消息未发送（降级）');
      return;
    }
    try {
      const res = await fetch(
        `${WecomAdapter.API_BASE}/message/send?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touser: conversationId,
            msgtype: 'text',
            agentid: Number(this.agentId),
            text: { content },
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const json: any = await res.json();
      if (json?.errcode !== 0) {
        this.logger.error(
          `[企业微信] 发送失败 errcode=${json?.errcode} errmsg=${json?.errmsg || ''}`,
        );
        // 40014/42001 = token 无效/过期 → 清缓存，下次调用重新获取
        if (json?.errcode === 40014 || json?.errcode === 42001) {
          this.tokenCache = null;
        }
        return;
      }
      this.logger.log(`[企业微信] 已发送给 ${conversationId}: ${content.slice(0, 50)}`);
    } catch (e) {
      this.logger.error(`[企业微信] 发送异常: ${(e as Error).message}`);
    }
  }

  verifyWebhook(payload: any): boolean {
    // 宽松模式：企业微信回调验签依赖 EncodingAESKey（URL 配置时由平台校验），
    // 当前保持放行，便于联调；后续接入回调时再按官方加解密规范实现。
    return true;
  }

  async getCustomer(customerId: string): Promise<any> {
    // TODO: 接入企业微信通讯录查询
    return { id: customerId, name: '企业微信用户' };
  }

  async syncCustomer(platformId: string, tenantId: string): Promise<any> {
    // TODO: 接入企业微信通讯录同步
    return { id: platformId, name: '企业微信用户', channel: 'wecom' };
  }

  processMessage(message: any, botId: string, tenantId: string): Promise<ChannelMessage | null> {
    // Process incoming WeCom message
    return Promise.resolve({
      id: message.msgid || Date.now().toString(),
      content: message.text?.content || '',
      sender: message.from,
      timestamp: new Date(),
      platformId: message.from,
    });
  }
}
