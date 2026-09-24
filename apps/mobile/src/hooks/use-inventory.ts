/**
 * PHASE MOBILE-05 — 库存数据层（GET /m/inventory，复用 get_product_inventory 工具）。
 * 懒加载：仅在「库存预警」分段被打开时请求一次；下拉刷新驱动，无轮询。
 * 不传 limit：使用服务端默认（20 条）—— 避免与 DTO 上限不一致导致 400。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { describeApiError } from '@/lib/api';
import { buildInventorySummary, type InventorySummary } from '@/lib/catalog-view-model';
import { fetchInventory, type MobileInventoryResponse } from '@/lib/mobile-api';
import { warningLabel } from '@/lib/agent-view-model';
import type { LazyPhase } from './use-products';

const EMPTY_SUMMARY: InventorySummary = {
  available: false,
  thresholdLabel: null,
  lowStockCountLabel: null,
  outOfStockCountLabel: null,
  lowStockRows: [],
  outOfStockRows: [],
  truncated: false,
};

export interface UseInventoryResult {
  readonly phase: LazyPhase;
  readonly summary: InventorySummary;
  readonly raw: MobileInventoryResponse | null;
  readonly threshold: number | null;
  readonly error: string | null;
  readonly warnings: readonly string[];
  readonly refreshing: boolean;
  readonly reload: () => void;
}

export function useInventory(enabled: boolean): UseInventoryResult {
  const [phase, setPhase] = useState<LazyPhase>('idle');
  const [raw, setRaw] = useState<MobileInventoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);
  const startedRef = useRef(false);
  const inFlightRef = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh'): Promise<void> => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (mode === 'refresh') setRefreshing(true);
    else setPhase('loading');
    try {
      const response = await fetchInventory();
      if (!mountedRef.current) return;
      setRaw(response);
      if (!response.available) {
        setError(response.error ? warningLabel(response.error) : '数据暂时无法获取，请稍后再试。');
        setPhase((previous) => (previous === 'ready' ? 'ready' : 'error'));
      } else {
        setError(null);
        setPhase('ready');
      }
    } catch (caught) {
      if (!mountedRef.current) return;
      setError(describeApiError(caught));
      setPhase((previous) => (previous === 'ready' ? 'ready' : 'error'));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled && !startedRef.current) {
      startedRef.current = true;
      void load('initial');
    }
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, load]);

  const reload = useCallback((): void => {
    void load(phase === 'ready' ? 'refresh' : 'initial');
  }, [load, phase]);

  const summary = useMemo(() => (raw ? buildInventorySummary(raw) : EMPTY_SUMMARY), [raw]);

  return {
    phase,
    summary,
    raw,
    threshold: raw?.available ? raw.threshold : null,
    error,
    warnings: raw?.warnings ?? [],
    refreshing,
    reload,
  };
}
