import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelAdapter, ChannelMessage } from './channel.interface';
import {
  TOP_GATEWAY,
  signTopParamsUpper,
  verifyTopSign,
  formatTopTimestamp,
} from './taobao.signature';

/**
 * 千牛/淘宝开放平台接入（真实实现）
 *
 * 需要配置环境变量：
 *   TAOBAO_APP_KEY      开放平台应用 AppKey
 *   TAOBAO_APP_SECRET   开放平台应用 AppSecret（验签 + API 签名）
 *   TAOBAO_ACCESS_TOKEN 商家授权 token（千牛授权换取）
 *   TAOBAO_SELLER_UID   可选：发送方 OpenIM uid（卖家），缺省用 app_key
 *
 * P0-5A：verifyWebhook 改为强制验签（失败关闭）——不再存在宽松放行路径；
 * 凭证缺失 → 拒绝（由 controller 回 503 未配置）。TAOBAO_WEBHOOK_STRICT 已废弃（无宽松模式）。
 */
@Injectable()
export class TaobaoAdapter implements ChannelAdapter {
  readonly channelName = 'taobao';
  private readonly logger = new Logger(TaobaoAdapter.name);

  /**
   * 千牛/旺旺消息发送接口：
   * 优先选择 taobao.openim.immsg.push（开放 IM 单聊消息推送，TOP 网关真实存在）。
   * taobao.openim.tribe.sendmsg（群消息）已随 OpenIM 群能力下线，不作为首选。
   * 注意：openim 系接口需在开放平台单独申请权限（审核通过后方可调用），
   * 未申请/未授权时 TOP 会返回 error_response，本适配器记错误日志不抛异常。
   */
  private readonly sendMethod = 'taobao.openim.immsg.push';

  constructor(private readonly config: ConfigService) {}

  /**
   * 千牛推送消息验签（TOP 网关签名：md5(secret + 排序后参数拼接 + secret)）。
   * P0-5A：强制验签、失败关闭。
   * - 无 TAOBAO_APP_SECRET：拒绝（controller 回 503 未配置）
   * - 有凭证：按 TOP 规范验签；失败一律拒绝
   */
  verifyWebhook(payload: any): boolean {
    const appSecret = this.config.get<string>('TAOBAO_APP_SECRET');
    if (!appSecret) {
      this.logger.error('[千牛] TAOBAO_APP_SECRET 未配置，拒绝 webhook（P0-5A：验签强制、失败关闭）');
      return false;
    }
    if (verifyTopSign(payload || {}, appSecret)) {
      return true;
    }
    this.logger.error('[千牛] 签名校验失败，拒绝请求');
    return false;
  }

  async receiveMessage(): Promise<ChannelMessage | null> {
    return null; // 消息通过 webhook 主动推送，不使用轮询
  }

  /**
   * 把 AI 回复发送回千牛买家（真实 TOP API 调用）。
   * 凭证未配齐 → 告警降级，不发送不报错。
   * conversationId 为买家会话标识（买家 nick / tid / OpenIM uid）。
   */
  async sendMessage(conversationId: string, content: string): Promise<void> {
    const appKey = this.config.get<string>('TAOBAO_APP_KEY');
    const appSecret = this.config.get<string>('TAOBAO_APP_SECRET');
    const accessToken = this.config.get<string>('TAOBAO_ACCESS_TOKEN');
    if (!appKey || !appSecret || !accessToken) {
      this.logger.warn(
        `[千牛] 凭证未配齐（TAOBAO_APP_KEY/TAOBAO_APP_SECRET/TAOBAO_ACCESS_TOKEN），消息未发送（降级）: ${content.slice(0, 30)}...`,
      );
      return;
    }

    const sellerUid = this.config.get<string>('TAOBAO_SELLER_UID') || appKey;
    const params: Record<string, string> = {
      method: this.sendMethod,
      app_key: appKey,
      session: accessToken,
      timestamp: formatTopTimestamp(),
      format: 'json',
      v: '2.0',
      sign_method: 'md5',
      userid: conversationId, // 接收方：买家（OpenIM uid / nick）
      fromuser: sellerUid, // 发送方：卖家
      immsg: JSON.stringify({ type: 'text', content }), // OpenIM 消息体（text）
    };
    // TOP 签名：md5(secret + 排序后 key+value 拼接 + secret)，官方 SDK 输出大写
    params.sign = signTopParamsUpper(params, appSecret);

    try {
      const res = await fetch(TOP_GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams(params).toString(),
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* 非 JSON 响应，走下方日志 */
      }
      if (json?.error_response) {
        const err = json.error_response;
        this.logger.error(
          `[千牛] 发送失败 method=${this.sendMethod} code=${err.code} msg=${err.msg || ''} sub=${err.sub_msg || ''}`,
        );
        return;
      }
      this.logger.log(`[千牛] 已调用 ${this.sendMethod} 回复 ${conversationId}: ${content.slice(0, 50)}`);
    } catch (e) {
      this.logger.error(`[千牛] 发送异常: ${(e as Error).message}`);
    }
  }

  async getCustomer(customerId: string): Promise<any> {
    return { id: customerId, name: '淘宝买家' };
  }

  async syncCustomer(platformId: string, tenantId: string): Promise<any> {
    return { id: platformId, name: '淘宝买家', channel: 'taobao' };
  }

  /**
   * 解析千牛/淘宝推送的买家消息，标准化为 ChannelMessage。
   * 兼容格式：
   *   - 通用：{ content/text, senderId/fromId/buyerNick, msgId/id, type }
   *   - 消息服务推送：{ topic, userId, ownerId, timestamp, sign, content(JSON 字符串) }
   *   - 交易消息：content 内含 tid / buyer_nick / status 等
   *   - 千牛消息：content 为对象 { text | pic_url }，msgType: text|image
   * 会话标识映射：conversationId = 显式 conversationId || tid || 买家 nick，作为 platformId。
   */
  processMessage(message: any, botId: string, tenantId: string): Promise<ChannelMessage | null> {
    try {
      const payload = message || {};

      // 消息服务推送：content 是 JSON 字符串 → 解包，并把业务字段摊平到顶层
      let inner: any = payload;
      if (typeof payload.content === 'string' && /^[{[]/.test(payload.content.trim())) {
        try {
          const parsed = JSON.parse(payload.content);
          inner = { ...payload, content: parsed };
        } catch {
          inner = payload;
        }
      }
      const data =
        inner.content && typeof inner.content === 'object' && !Array.isArray(inner.content)
          ? { ...inner, ...inner.content }
          : inner;

      // 消息类型：text / image
      const rawType = this.pick(data, ['msgType', 'msg_type', 'type']);
      const msgType =
        typeof rawType === 'string' && /image|img|pic/i.test(rawType) ? 'image' : 'text';

      // 消息内容（文字或图片 URL）
      let content = '';
      if (data.content && typeof data.content === 'object') {
        content =
          this.pick(data.content, ['text', 'content']) ||
          this.pick(data.content, ['pic_url', 'img', 'image', 'url']) ||
          JSON.stringify(data.content);
      } else {
        content = this.pick(data, ['content', 'text']) || '';
        if (!content && data.msg) {
          content = typeof data.msg === 'string' ? data.msg : this.pick(data.msg, ['text', 'content']) || '';
        }
      }
      if (msgType === 'image') {
        content =
          this.pick(data, ['pic_url', 'img', 'image', 'url']) ||
          (data.content && typeof data.content === 'object'
            ? this.pick(data.content, ['pic_url', 'img', 'image', 'url'])
            : '') ||
          content;
      }
      content = String(content || '').trim();
      if (!content) {
        this.logger.warn('[千牛] 收到空内容消息，忽略');
        return Promise.resolve(null);
      }

      const sender = this.pick(data, ['buyerNick', 'buyer_nick', 'senderId', 'fromId', 'from', 'sender', 'userId']) || 'unknown';
      const conversationId =
        this.pick(data, ['conversationId', 'tid', 'buyerNick', 'buyer_nick']) || sender;
      const msgId =
        this.pick(data, ['msgId', 'id', 'msg_id', 'messageId']) ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      let timestamp = new Date();
      const rawTs = this.pick(data, ['timestamp', 'time']);
      if (typeof rawTs === 'number' && rawTs > 0) {
        timestamp = new Date(rawTs > 1e12 ? rawTs : rawTs * 1000);
      } else if (typeof rawTs === 'string' && !isNaN(Date.parse(rawTs))) {
        timestamp = new Date(rawTs);
      }

      return Promise.resolve({
        id: String(msgId),
        content,
        sender: String(sender),
        timestamp,
        platformId: String(conversationId),
        metadata: {
          ...payload,
          conversationId,
          msgType,
          buyerNick: sender,
          raw: data,
        },
      });
    } catch (e) {
      this.logger.error(`[千牛] 消息解析失败: ${(e as Error).message}`);
      return Promise.resolve(null);
    }
  }

  /** 按顺序取第一个非空字段值 */
  private pick(obj: any, keys: string[]): any {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const k of keys) {
      const v = obj[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }
}
