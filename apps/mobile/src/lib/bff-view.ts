/**
 * PHASE MOBILE-06 — 新增 BFF 页面的展示层纯函数（零 RN 依赖）。
 * 只做「内部码 → 中文文案」的翻译；不生成任何业务数值。
 */

import { formatDateTimeShort } from './format';

/** 转人工原因码 → 文案（码值来源：Conversation.handoffReason 注释）。 */
const REASON_LABELS: Readonly<Record<string, string>> = {
  unknown_intent: 'AI 无法识别意图',
  low_confidence: 'AI 置信度不足',
  fallback_response: 'AI 走了兜底回复',
  manual: '客户/客服主动转人工',
};

export function handoffReasonLabel(reason: string | null): string {
  if (!reason) return '未提供原因';
  return REASON_LABELS[reason] ?? '其他原因';
}

/** 会话渠道 → 文案（Channel 默认 web；其余按实际取值兜底）。 */
const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  web: '网页',
  wechat: '微信',
  wecom: '企业微信',
  taobao: '淘宝',
  douyin: '抖音',
  webchat: '网站对话',
  api: '接口',
};

export function channelLabel(channel: string | null): string {
  if (!channel) return '未知渠道';
  return CHANNEL_LABELS[channel] ?? '其他渠道';
}

/** 消息发送方 → 文案。 */
export function senderLabel(sender: string | null): string {
  if (sender === 'customer') return '客户';
  if (sender === 'bot') return 'AI';
  return '—';
}

/** 客户状态 → 文案。 */
const CUSTOMER_STATUS_LABELS: Readonly<Record<string, string>> = {
  active: '活跃',
  inactive: '不活跃',
  blocked: '已拉黑',
};

export function customerStatusLabel(status: string): string {
  return CUSTOMER_STATUS_LABELS[status] ?? '其他状态';
}

/** 时间点格式化（null → null，由 UI 显示「—」）。 */
export function timeLabel(iso: string | null | undefined): string | null {
  return formatDateTimeShort(iso ?? null);
}

/** 分页计数文案（total 为 null 时不伪造条数）。 */
export function pagedTotalLabel(total: number | null, unit: string): string | null {
  if (total === null) return null;
  return `${total} ${unit}`;
}
