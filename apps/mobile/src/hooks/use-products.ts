/**
 * PHASE MOBILE-05 — 商品数据层（GET /products，白名单消费）。
 * 懒加载：仅在「商品」分段被打开时请求一次；之后由下拉刷新驱动，无轮询。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { describeApiError } from '@/lib/api';
import { buildProductList, type ProductListModel } from '@/lib/catalog-view-model';
import type { MobileProductRow } from '@/lib/mobile-api';
import { fetchMobileProducts } from '@/lib/mobile-api-extra';

export type LazyPhase = 'idle' | 'loading' | 'ready' | 'error';

const EMPTY_LIST: ProductListModel = { rows: [], rawCount: 0, activeCount: 0, hiddenCount: 0 };

export interface UseProductsResult {
  readonly phase: LazyPhase;
  readonly list: ProductListModel;
  readonly error: string | null;
  readonly refreshing: boolean;
  readonly reload: () => void;
}

export function useProducts(enabled: boolean, lowStockThreshold: number | null = null): UseProductsResult {
  const [phase, setPhase] = useState<LazyPhase>('idle');
  const [raw, setRaw] = useState<readonly MobileProductRow[]>([]);
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
      // PHASE MOBILE-06：改用 BFF /m/products（分页 + 字段白名单；服务端已过滤 isDeleted）
      // 视图模型仍复用既有签名，因此把 isDeleted 显式补为 false（服务端保证）。
      const response = await fetchMobileProducts({ page: 1, limit: 50 });
      const rows: MobileProductRow[] = response.items.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku,
        status: item.status,
        stockStatus: item.stockStatus,
        stockQuantity: item.stockQuantity,
        isDeleted: false,
      }));
      if (!mountedRef.current) return;
      setRaw(rows);
      setError(null);
      setPhase('ready');
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

  const list = useMemo(() => buildProductList(raw, lowStockThreshold), [raw, lowStockThreshold]);

  return { phase, list, error, refreshing, reload };
}

export const EMPTY_PRODUCT_LIST = EMPTY_LIST;
