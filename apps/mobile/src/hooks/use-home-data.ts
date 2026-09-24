/**
 * PHASE MOBILE-04 — 首页数据层。
 *
 * 职责：把 GET /m/home 的返回映射为 UI 可直接消费的状态机。
 *   loading → ready / error；刷新失败保留旧数据但给出错误提示。
 *
 * 明确不做：
 *   - 不做轮询 / 定时器（指令 §D：避免高频自动刷新）
 *   - 不做客户端缓存（服务端已有 60s TTL 缓存）
 *   - 不 mock、不补默认值（后端 null 即「暂无数据」）
 *   - 401 由 src/lib/api.ts 拦截器统一清会话，本层只转译为安全文案
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { describeApiError } from '@/lib/api';
import {
  fetchHome,
  MOBILE_HOME_FIRST_PAINT_SECTIONS,
  type MobileHomeResponse,
  type MobileHomeSectionName,
  type MobileInventoryData,
  type MobileOverviewData,
  type MobileSectionMeta,
  type MobileTimeRange,
} from '@/lib/mobile-api';

export type HomePhase = 'loading' | 'ready' | 'error';

export interface UseHomeDataResult {
  /** 首屏加载态（true 时显示骨架，不阻塞页面其它部分）。 */
  readonly phase: HomePhase;
  readonly data: MobileHomeResponse | null;
  /** 面向用户的安全错误文案（不含堆栈 / 状态码）。 */
  readonly error: string | null;
  /** 下拉刷新进行中。 */
  readonly refreshing: boolean;
  readonly overview: MobileOverviewData | null;
  readonly inventory: MobileInventoryData | null;
  readonly timeRange: MobileTimeRange | null;
  readonly sections: Readonly<Partial<Record<MobileHomeSectionName, MobileSectionMeta>>>;
  readonly requestedSections: readonly MobileHomeSectionName[];
  readonly degraded: boolean;
  readonly warnings: readonly string[];
  readonly asOf: string | null;
  /** 手动重试 / 下拉刷新统一入口。 */
  readonly reload: () => void;
}

const EMPTY_SECTIONS: Readonly<Partial<Record<MobileHomeSectionName, MobileSectionMeta>>> = {};

export function useHomeData(
  sections: readonly MobileHomeSectionName[] = MOBILE_HOME_FIRST_PAINT_SECTIONS,
): UseHomeDataResult {
  const [phase, setPhase] = useState<HomePhase>('loading');
  const [data, setData] = useState<MobileHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);
  const startedRef = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh'): Promise<void> => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const next = await fetchHome(sections);
        if (!mountedRef.current) return;
        setData(next);
        setError(null);
        setPhase('ready');
      } catch (caught) {
        if (!mountedRef.current) return;
        setError(describeApiError(caught));
        // 已有数据时不回到整屏错误态：保留旧数据 + 顶部错误提示。
        setPhase((previous) => (previous === 'ready' ? 'ready' : 'error'));
      } finally {
        if (mountedRef.current && mode === 'refresh') setRefreshing(false);
      }
    },
    [sections],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      void load('initial');
    }
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const reload = useCallback((): void => {
    void load(data ? 'refresh' : 'initial');
  }, [load, data]);

  const overview = data?.overview ?? null;
  const inventory = data?.inventory ?? null;

  return {
    phase,
    data,
    error,
    refreshing,
    overview,
    inventory,
    timeRange: data?.timeRange ?? null,
    sections: data?.sections ?? EMPTY_SECTIONS,
    requestedSections: sections,
    degraded: data?.degraded ?? false,
    warnings: data?.warnings ?? [],
    asOf: data?.asOf ?? null,
    reload,
  };
}
