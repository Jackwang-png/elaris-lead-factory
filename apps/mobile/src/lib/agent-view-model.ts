/**
 * PHASE MOBILE-04 — AI 页面展示层纯函数（零 RN 依赖，便于在 Node 下验证）。
 *
 * 原则：
 *   - 只做**标签翻译**与**错误文案映射**，不生成任何业务数值（数值一律来自服务端 facts）
 *   - 内部标识（tool 名、warning 码、错误码）不直接暴露给用户
 *   - 未知码不猜测含义，走兜底文案
 */

import { formatClock } from './format';
import type { AgentSourceFact } from './mobile-api';

/** 10 个 Agent Tool 的业务中文名（与 apps/api/src/agent/tools/* 一一对应）。 */
const TOOL_LABELS: Readonly<Record<string, string>> = {
  get_store_overview: '经营概览',
  get_order_stats: '订单统计',
  search_orders: '订单查询',
  get_order_detail: '订单详情',
  search_products: '商品查询',
  get_product_inventory: '库存预警',
  search_customers: '客户查询',
  get_customer_orders: '客户订单',
  get_sales_trend: '销售趋势',
  get_business_alerts: '经营异常',
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? '经营数据';
}

/** 服务端 warning 码 → 用户可读文案（前缀匹配，如 TOOL_FORBIDDEN:get_order_stats）。 */
export function warningLabel(warning: string): string {
  if (warning.startsWith('TOOL_FORBIDDEN')) return '部分数据因账号权限未展示';
  if (warning.startsWith('TOOL_TIMEOUT')) return '部分数据查询超时';
  if (warning.startsWith('TOOL_FAILED') || warning.startsWith('AGENT_TOOL_FAILED')) {
    return '部分数据暂时无法获取';
  }
  if (warning === 'INSUFFICIENT_DATA') return '目前没有足够数据可回答该问题';
  if (warning === 'OUT_OF_SCOPE') return '该问题超出店铺数据范围';
  if (warning === 'FACT_SELF_CHECK_WARN' || warning === 'AGENT_FACT_VIOLATION') {
    return '部分数字未能通过自检，请以「数据依据」为准';
  }
  if (warning === 'AGENT_BUDGET_EXCEEDED') return '本次查询耗时较长，已返回已完成部分';
  return '部分内容可能不完整';
}

/** 服务端错误码 → 安全中文文案（与后端 AGENT_SAFE_MESSAGES 同义，客户端不渲染服务端原文）。 */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  AGENT_INVALID_INPUT: '请输入 1~2000 字的有效问题。',
  AGENT_QUOTA_EXCEEDED: '今日 AI 额度已用尽，请稍后重试。',
  AGENT_RATE_LIMITED: '当前咨询较多，请稍后再试。',
  AGENT_TOOL_FORBIDDEN: '当前账号权限不足，无法查询该数据。',
  AGENT_TOOL_UNKNOWN: '这个问题我暂时回答不了，请换个问法。',
  AGENT_TOOL_ARG_INJECTION: '请求参数不合法。',
  AGENT_TOOL_TIMEOUT: '数据查询超时，请稍后再试。',
  AGENT_TOOL_FAILED: '数据暂时无法获取，请稍后再试。',
  AGENT_ALL_TOOLS_FAILED: '数据暂时无法获取，请稍后再试。',
  AGENT_PLAN_FAILED: '我没完全理解这个问题，能补充一下时间范围或指标吗？',
  AGENT_ANALYSIS_FAILED: 'AI 解读暂不可用，以下是可核对的数据。',
  AGENT_FACT_VIOLATION: '我暂时无法确认这些数字，以下是可核对的数据。',
  AGENT_BUDGET_EXCEEDED: '本次查询耗时过长，已先返回已完成部分。',
  AGENT_INTERNAL: '服务暂时不可用，请稍后再试。',
};

const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  400: '请求不合法，请重新输入。',
  401: '登录状态已失效，请重新登录。',
  403: '当前账号无权访问该数据。',
  404: '该功能暂不可用。',
  408: '查询超时，请稍后再试。',
  429: '请求过于频繁，请稍后再试。',
  500: '服务暂时不可用，请稍后再试。',
  502: '服务暂时不可用，请稍后再试。',
  503: '数据暂时无法获取，请稍后再试。',
};

interface ErrorLike {
  readonly status?: number;
  readonly code?: string;
}

/**
 * 把任意异常转成用户可读文案。
 * 优先使用服务端返回的**错误码**（走本地文案表），其次按 HTTP 状态码兜底，
 * 最后统一为通用网络文案 —— 绝不渲染服务端堆栈或原始报文。
 */
export function describeAgentError(error: unknown): string {
  const source = (error ?? {}) as { response?: { status?: number; data?: ErrorLike } };
  const status = source.response?.status;
  const code = source.response?.data?.code;
  if (typeof code === 'string' && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  if (typeof status === 'number' && STATUS_MESSAGES[status]) {
    return STATUS_MESSAGES[status];
  }
  return '网络异常，请检查网络后重试。';
}

/**
 * 服务端 timeRange 字符串（"from~to"，UTC ISO）→ 可读区间。
 *
 * 关键：服务端统计窗口是 **+08:00 自然日**（如 2026-09-17T16:00Z ~ 2026-09-18T16:00Z
 * 表示北京时间 09-18 全天）。若按设备本地时区直接格式化，会显示成
 * 「09-18 → 09-19」这类误导结果；因此这里**固定按 Asia/Shanghai(+08:00) 语义**格式化，
 * 并把「00:00 起、满 24 小时」的窗口识别为单日全天。
 * 无法解析时原样返回，绝不编造。
 */
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

interface CstParts {
  readonly day: string;
  readonly clock: string;
  readonly ts: number;
}

function toCstParts(iso: string): CstParts | null {
  const date = new Date(iso);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return null;
  const shifted = new Date(ts + CN_OFFSET_MS);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  return { day: `${yyyy}-${mm}-${dd}`, clock: `${hh}:${mi}`, ts };
}

export function formatRangeLabel(range: string | null | undefined): string | null {
  if (!range) return null;
  const [fromIso, toIso] = range.split('~');
  if (!fromIso || !toIso) return range;
  const from = toCstParts(fromIso);
  const to = toCstParts(toIso);
  if (!from || !to) return range;

  const hours = (to.ts - from.ts) / (60 * 60 * 1000);
  // +08:00 自然日窗口：00:00 起、恰好 24 小时（to 为下一日 00:00）
  if (from.clock === '00:00' && to.clock === '00:00' && Math.abs(hours - 24) < 0.01) {
    return `${from.day}（全天）`;
  }
  if (from.day === to.day) {
    return `${from.day} ${from.clock} ~ ${to.clock}`;
  }
  return `${from.day} ${from.clock} → ${to.day} ${to.clock}`;
}

/** 数据来源行：业务名 + 统计时间（无来源时返回空数组，不编造）。 */
export interface SourceRow {
  readonly key: string;
  readonly label: string;
  readonly asOfLabel: string | null;
  readonly rowCount: number | null;
}

export function buildSourceRows(sources: readonly AgentSourceFact[]): readonly SourceRow[] {
  return sources.map((source, index) => ({
    key: `${source.tool}-${index}`,
    label: toolLabel(source.tool),
    asOfLabel: formatClock(source.asOf),
    rowCount: typeof source.rowCount === 'number' ? source.rowCount : null,
  }));
}
