import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { verifyTopSign } from './taobao.signature';

/**
 * P0-5A Webhook Security Service —— 统一 webhook 安全门。
 *
 * 原则（与任务书一致）：
 *   1. 验签默认必须通过：不存在"宽松放行"路径；凭证缺失 → 503（未配置，失败关闭）。
 *   2. tenant 身份只来自服务端映射（env），绝不信 body/query 自报的 tenantId/botId。
 *   3. 防重放：timestamp 新鲜度窗口 + 事件 key 去重（进程内缓存；单实例部署即可，
 *      多实例需换 Redis —— 见 Tech-Debt）。
 *   4. bot 归属校验：bot 必须存在且属于该 tenant（防伪造 botId 消耗别家 AI 额度）。
 *
 * 平台协议事实（2026-08-09 核对代码 + 平台文档）：
 *   - 淘宝/千牛（TOP）：md5(secret + ASCII 升序参数拼接 + secret)，参数含 timestamp
 *     （北京时区 yyyy-MM-dd HH:mm:ss）。平台未定义 nonce/replay 字段 → SmartCS 侧
 *     实现"新鲜度窗口 + 事件 key 去重"（平台支持签名 / SmartCS 补 replay）。
 *   - 微信公众号：URL 验证 GET 携带 signature=sha1(sort(token,timestamp,nonce))；
 *     POST 明文模式平台不提供逐条签名（平台不支持）→ 仅安全模式（Encrypt +
 *     msg_signature=sha1(sort(token,timestamp,nonce,Encrypt))）可验证；
 *     明文模式必须显式 WECHAT_WEBHOOK_PLAINTEXT_ALLOWED=true 才处理（残留风险记录）。
 *   - 抖音/小红书：当前无平台侧验签实现 → SmartCS 自定义共享密钥 HMAC
 *     （sign = HMAC-SHA256(secret, `${timestamp}|${nonce}|${rawBody}`)），
 *     接入真实平台回调时按平台协议替换。
 */

export interface WebhookSecurityResult {
  ok: boolean;
  /** 建议 HTTP 状态：401 验签失败 / 403 身份或归属拒绝 / 503 未配置 */
  status: number;
  reason: string;
}

/** timestamp 新鲜度窗口（毫秒）：±5 分钟 */
export const REPLAY_WINDOW_MS = 5 * 60 * 1000;
/** 重放缓存 TTL（毫秒）：窗口的 2 倍 */
const REPLAY_CACHE_TTL_MS = 10 * 60 * 1000;
/** 缓存上限，超出触发惰性清扫 */
const REPLAY_CACHE_MAX = 5000;

/** 淘宝 TOP timestamp：'yyyy-MM-dd HH:mm:ss'（北京时间 GMT+8）→ epoch ms */
export function parseTopTimestamp(s: unknown): number | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  const t = Date.parse(s.trim().replace(' ', 'T') + '+08:00');
  return Number.isNaN(t) ? null : t;
}

/** 微信 sha1(sort(token, timestamp, nonce[, encrypt])) 验签（官方协议） */
export function buildWechatSignature(token: string, parts: string[]): string {
  const sorted = [...parts, token].sort();
  return createHash('sha1').update(sorted.join('')).digest('hex');
}

@Injectable()
export class WebhookSecurityService {
  private readonly logger = new Logger(WebhookSecurityService.name);
  /** 重放缓存：key -> expiresAt */
  private readonly replayCache = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // -------------------------------------------------------------------------
  // 1) 签名验证（按平台真实协议；全部失败关闭）
  // -------------------------------------------------------------------------

  /** 淘宝/千牛 TOP 验签（强制）：无凭证 → 503；签名错/缺 → 401；timestamp 过期 → 401 */
  verifyTaobao(payload: any): WebhookSecurityResult {
    const appSecret = this.config.get<string>('TAOBAO_APP_SECRET');
    if (!appSecret) {
      return { ok: false, status: 503, reason: 'taobao webhook not configured (TAOBAO_APP_SECRET missing)' };
    }
    if (!verifyTopSign(payload || {}, appSecret)) {
      return { ok: false, status: 401, reason: 'invalid TOP signature' };
    }
    const ts = parseTopTimestamp(payload?.timestamp);
    if (!ts || !this.isFresh(ts)) {
      return { ok: false, status: 401, reason: 'missing, malformed or expired timestamp' };
    }
    return { ok: true, status: 200, reason: 'ok' };
  }

  /** 微信公众号 URL 验证 GET 验签：无 token → 503；签名错/缺 → 403；timestamp 过期 → 403 */
  verifyWechatGet(query: Record<string, any>): WebhookSecurityResult {
    const token = this.config.get<string>('WECHAT_TOKEN');
    if (!token) {
      return { ok: false, status: 503, reason: 'wechat webhook not configured (WECHAT_TOKEN missing)' };
    }
    const { signature, timestamp, nonce } = query || {};
    if (!signature || !timestamp || !nonce) {
      return { ok: false, status: 403, reason: 'missing signature/timestamp/nonce' };
    }
    if (!this.isFresh(Number(timestamp))) {
      return { ok: false, status: 403, reason: 'expired timestamp' };
    }
    const expected = buildWechatSignature(token, [String(timestamp), String(nonce)]);
    if (!this.safeEqual(expected, String(signature))) {
      return { ok: false, status: 403, reason: 'invalid signature' };
    }
    return { ok: true, status: 200, reason: 'ok' };
  }

  /**
   * 微信公众号 POST 消息验签：
   *  - 安全模式（body.Encrypt）：验 msg_signature=sha1(sort(token,timestamp,nonce,Encrypt))；
   *    无 WECHAT_ENCODING_AES_KEY 时无法解密 → 503。
   *  - 明文模式：平台无逐条签名 → 仅 WECHAT_WEBHOOK_PLAINTEXT_ALLOWED=true 才放行（残留风险）。
   */
  verifyWechatPost(body: any): WebhookSecurityResult {
    const token = this.config.get<string>('WECHAT_TOKEN');
    if (!token) {
      return { ok: false, status: 503, reason: 'wechat webhook not configured (WECHAT_TOKEN missing)' };
    }
    const enc = body?.Encrypt;
    if (enc) {
      const msgSig = body?.msg_signature;
      const ts = body?.timestamp;
      const nonce = body?.nonce;
      if (!msgSig || !ts || !nonce) {
        return { ok: false, status: 403, reason: 'missing msg_signature/timestamp/nonce' };
      }
      if (!this.isFresh(Number(ts))) {
        return { ok: false, status: 403, reason: 'expired timestamp' };
      }
      const expected = buildWechatSignature(token, [String(ts), String(nonce), String(enc)]);
      if (!this.safeEqual(expected, String(msgSig))) {
        return { ok: false, status: 403, reason: 'invalid msg_signature' };
      }
      if (!this.config.get<string>('WECHAT_ENCODING_AES_KEY')) {
        return { ok: false, status: 503, reason: 'wechat safe-mode decryption not configured (WECHAT_ENCODING_AES_KEY missing)' };
      }
      return { ok: true, status: 200, reason: 'ok' };
    }
    // 明文模式
    const allowed = this.config.get<string>('WECHAT_WEBHOOK_PLAINTEXT_ALLOWED') === 'true';
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        reason:
          'wechat plaintext webhook cannot be verified (platform provides no per-message signature); ' +
          'use safe mode (Encrypt) or set WECHAT_WEBHOOK_PLAINTEXT_ALLOWED=true to accept the residual risk',
      };
    }
    return { ok: true, status: 200, reason: 'ok' };
  }

  /**
   * 抖音/小红书共享密钥 HMAC 验签（SmartCS 自定义方案，接入真实平台时替换）：
   *   sign = HMAC-SHA256(secret, `${timestamp}|${nonce}|${bodyText}`)（hex 小写）
   * bodyText = 原始请求体字节（utf8），保证签名绑定请求内容。
   */
  verifyHmac(
    body: any,
    secretEnvKey: string,
    bodyText?: Buffer | string,
  ): WebhookSecurityResult {
    const secret = this.config.get<string>(secretEnvKey);
    if (!secret) {
      return { ok: false, status: 503, reason: `${secretEnvKey} not configured` };
    }
    const timestamp = body?.timestamp;
    const nonce = body?.nonce;
    const sign = body?.sign;
    if (typeof timestamp !== 'number' || !nonce || typeof sign !== 'string') {
      return { ok: false, status: 401, reason: 'missing timestamp/nonce/sign' };
    }
    if (!this.isFresh(timestamp)) {
      return { ok: false, status: 401, reason: 'expired timestamp' };
    }
    const payloadText =
      bodyText === undefined || bodyText === null
        ? JSON.stringify(body ?? {})
        : Buffer.isBuffer(bodyText)
          ? bodyText.toString('utf8')
          : String(bodyText);
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}|${nonce}|${payloadText}`)
      .digest('hex');
    if (!this.safeEqual(expected, sign.toLowerCase())) {
      return { ok: false, status: 401, reason: 'invalid HMAC signature' };
    }
    return { ok: true, status: 200, reason: 'ok' };
  }

  // -------------------------------------------------------------------------
  // 2) tenant 身份：只来自服务端映射（env），绝不读 body/query 自报值
  // -------------------------------------------------------------------------

  /** 渠道 → 服务端映射的 tenantId（未配置返回 null → 调用方回 503） */
  resolveTenantId(channel: string): string | null {
    const key =
      channel === 'taobao'
        ? 'TAOBAO_WEBHOOK_TENANT_ID'
        : channel === 'wechat'
          ? 'WECHAT_WEBHOOK_TENANT_ID'
          : channel === 'douyin'
            ? 'DOUYIN_WEBHOOK_TENANT_ID'
            : channel === 'xiaohongshu'
              ? 'XHS_WEBHOOK_TENANT_ID'
              : null;
    if (!key) return null;
    const v = this.config.get<string>(key);
    return v && v.trim() ? v.trim() : null;
  }

  // -------------------------------------------------------------------------
  // 3) bot 归属校验
  // -------------------------------------------------------------------------

  /** botId 必须存在且 tenantId 归属一致；空 botId 视为"无 bot 上下文"放行（由调用方决定） */
  async assertBotOwnedByTenant(
    botId: string,
    tenantId: string,
  ): Promise<WebhookSecurityResult> {
    if (!botId) return { ok: true, status: 200, reason: 'no botId provided (skipped)' };
    const bot = await this.prisma.bot.findFirst({
      where: { id: botId, tenantId },
      select: { id: true },
    });
    if (!bot) {
      return { ok: false, status: 403, reason: 'bot not found or not owned by tenant' };
    }
    return { ok: true, status: 200, reason: 'ok' };
  }

  // -------------------------------------------------------------------------
  // 4) 防重放
  // -------------------------------------------------------------------------

  /**
   * 事件 key 去重：同一 key 在 TTL 内重复出现 → 401（重放拒绝）。
   * 幂等语义：重复合法推送会被拒绝而不是重复执行（无副作用路径不会走到这里）。
   */
  markReplay(key: string): WebhookSecurityResult {
    if (!key) return { ok: true, status: 200, reason: 'ok' };
    const now = Date.now();
    const exp = this.replayCache.get(key);
    if (exp !== undefined && exp > now) {
      this.logger.warn(`replay detected, key=${key}`);
      return { ok: false, status: 401, reason: 'replay detected (duplicate event)' };
    }
    this.replayCache.set(key, now + REPLAY_CACHE_TTL_MS);
    if (this.replayCache.size > REPLAY_CACHE_MAX) this.sweep();
    return { ok: true, status: 200, reason: 'ok' };
  }

  /** 测试辅助：清空重放缓存 */
  resetReplayCache(): void {
    this.replayCache.clear();
  }

  // -------------------------------------------------------------------------
  // internal
  // -------------------------------------------------------------------------

  private isFresh(tsMs: number, now: number = Date.now()): boolean {
    if (!Number.isFinite(tsMs)) return false;
    return Math.abs(now - tsMs) <= REPLAY_WINDOW_MS;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, exp] of this.replayCache) {
      if (exp <= now) this.replayCache.delete(k);
    }
  }
}
