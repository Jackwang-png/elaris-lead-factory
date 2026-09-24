/**
 * 淘宝开放平台（TOP）签名工具
 *
 * 签名机制（与官方 SDK 一致，适用于 API 调用与消息服务推送验签）：
 *   1. 取全部参数（排除 sign 与值为空的参数），按参数名 ASCII 码升序排序
 *   2. 按 "参数名参数值" 无分隔符拼接成字符串
 *   3. 计算 md5(secret + 拼接串 + secret)
 *   4. 官方 SDK（TopClient::generateSign）输出 32 位大写 hex；
 *      部分资料/实现输出小写 → 验签时大小写不敏感兼容
 *
 * 网关：https://eco.taobao.com/router/rest
 * 参考：开放平台「签名机制」文档 + 官方多语言 SDK（generateSign 实现）
 */
import { createHash } from 'node:crypto';

export const TOP_GATEWAY = 'https://eco.taobao.com/router/rest';

/**
 * 验签/签名时排除的参数：
 *  - sign：签名本身
 *  - botId / tenantId：我们挂在回调 URL 上的自有参数（平台推送验签不包含它们）
 *  - echostr：URL 验证回显参数
 */
export const TOP_SIGN_EXCLUDE = ['sign', 'botId', 'tenantId', 'echostr'];

/** 值统一转字符串；对象/数组 JSON 序列化；null/undefined 视为空 */
export function stringifyValue(v: any): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * 构造待签名串：ASCII 升序 + key+value 无分隔符拼接，排除 sign 与空值
 */
export function buildTopSignString(
  params: Record<string, any>,
  exclude: string[] = TOP_SIGN_EXCLUDE,
): string {
  const keys = Object.keys(params || {})
    .filter((k) => !exclude.includes(k))
    .filter((k) => stringifyValue(params[k]) !== '')
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return keys.map((k) => `${k}${stringifyValue(params[k])}`).join('');
}

/** 计算 TOP 签名（32 位小写 hex） */
export function signTopParams(params: Record<string, any>, secret: string): string {
  return createHash('md5').update(secret + buildTopSignString(params) + secret).digest('hex');
}

/** 计算 TOP 签名（32 位大写 hex，官方 SDK 输出，API 调用时使用） */
export function signTopParamsUpper(params: Record<string, any>, secret: string): string {
  return signTopParams(params, secret).toUpperCase();
}

/**
 * 验签：大小写不敏感（同时兼容平台大写签名与任务描述的小写签名）。
 * 缺 secret / 缺 sign / 长度不对 → false。
 */
export function verifyTopSign(params: Record<string, any>, secret: string): boolean {
  if (!secret) return false;
  const received = stringifyValue(params?.sign).toLowerCase();
  if (!received || received.length !== 32) return false;
  const expected = signTopParams(params, secret).toLowerCase();
  return received === expected;
}

/** 格式化 TOP 公共参数时间戳：yyyy-MM-dd HH:mm:ss（北京时间 GMT+8） */
export function formatTopTimestamp(d: Date = new Date()): string {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}
