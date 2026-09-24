import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 每日 AI 额度耗尽。机器可识别 code = quota_exceeded（HTTP 429）。
 */
export class QuotaExceededException extends HttpException {
  constructor(message = 'AI 每日额度已用尽，请明日再试或升级套餐。') {
    super({ code: 'quota_exceeded', message }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * 订阅无效 / 已过期，AI 功能不可用。机器可识别 code = subscription_expired（HTTP 403）。
 */
export class SubscriptionExpiredException extends HttpException {
  constructor(message = '订阅已过期，AI 功能暂不可用，请续费后继续使用。') {
    super({ code: 'subscription_expired', message }, HttpStatus.FORBIDDEN);
  }
}
