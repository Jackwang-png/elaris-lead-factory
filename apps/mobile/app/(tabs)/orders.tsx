/**
 * PHASE MOBILE-05 — 订单列表（真实数据）。
 *
 * 数据源：GET /m/orders（复用后端 search_orders 工具；JWT 由 axios 拦截器注入，
 *         tenantId/userId/role 全部由服务端解析，本端零传参）
 *
 * 契约边界（严格按后端真实字段，不猜字段、不新增接口）：
 *   · items{orderNo,status,customerNameMasked,createdAt,paidAt,[amount,currency]}
 *   · 无商品明细字段 → 列表**不展示商品摘要**
 *   · amount/currency 按角色裁剪 → 缺失显示「金额不可见」，绝不用 0 冒充
 *   · 无 /m/orders/:id → 本阶段**不提供详情页、不做跳转**
 *
 * 交互：状态筛选 / 日期区间 / 订单号搜索 / 下拉刷新 / 分页加载 / loading / error / retry / 空状态
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { describeApiError } from '@/lib/api';
import { formatDateTimeShort } from '@/lib/format';
import { warningLabel } from '@/lib/agent-view-model';
import { fetchOrders, type MobileOrdersResponse } from '@/lib/mobile-api';
import {
  buildOrderRows,
  ORDER_STATUS_OPTIONS,
  RANGE_OPTIONS,
  rangeParams,
  totalLabel,
  type OrderRow,
  type RangeKey,
  type Tone,
} from '@/lib/orders-view-model';
import { colors, radius, spacing, typography } from '@/theme';

const PAGE_SIZE = 20;

function toneColor(tone: Tone): string {
  if (tone === 'success') return colors.success;
  if (tone === 'warning') return colors.warning;
  if (tone === 'danger') return colors.danger;
  if (tone === 'accent') return colors.accent;
  return colors.textSecondary;
}

function OrderCard({ row }: { row: OrderRow }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.orderNo} numberOfLines={1}>
          {row.orderNo}
        </Text>
        <View style={[styles.statusPill, { borderColor: toneColor(row.statusTone) }]}>
          <Text style={[styles.statusText, { color: toneColor(row.statusTone) }]}>{row.statusLabel}</Text>
        </View>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>客户</Text>
        <Text style={styles.cardValue} numberOfLines={1}>
          {row.customerLabel}
        </Text>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>金额</Text>
        <Text style={[styles.cardValue, row.amountLabel === null ? styles.cardValueMuted : null]}>
          {row.amountLabel ?? '金额不可见'}
        </Text>
      </View>

      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>下单</Text>
        <Text style={styles.cardValue}>{row.createdLabel}</Text>
      </View>

      {row.paidLabel ? (
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>付款</Text>
          <Text style={styles.cardValue}>{row.paidLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      style={[styles.chip, active ? styles.chipActive : null, disabled ? styles.chipDisabled : null]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>('default');
  const [searchText, setSearchText] = useState('');
  const [keyword, setKeyword] = useState('');

  const [rows, setRows] = useState<readonly OrderRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rangeHint, setRangeHint] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const hasMoreRef = useRef(false);

  const load = useCallback(
    async (targetPage: number, mode: 'initial' | 'refresh' | 'more'): Promise<void> => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (mode === 'initial') setPhase('loading');
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);

      try {
        const response: MobileOrdersResponse = await fetchOrders({
          page: targetPage,
          limit: PAGE_SIZE,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...rangeParams(rangeKey),
          ...(keyword.length > 0 ? { keyword } : {}),
        });

        const nextRows = buildOrderRows(response.items);
        setRows((previous) => (targetPage === 1 ? nextRows : [...previous, ...nextRows]));
        setTotal(response.total);
        setLimit(response.limit);
        setRangeHint(response.rangeHint ?? null);
        setWarnings(response.warnings);
        setAsOf(response.asOf);

        hasMoreRef.current =
          nextRows.length >= response.limit &&
          (response.total === null || targetPage * response.limit < response.total);

        if (!response.available) {
          // HTTP 200 但工具失败：服务端给出安全错误码
          setError(response.error ? warningLabel(response.error) : '数据暂时无法获取，请稍后再试。');
          setPhase((previous) => (previous === 'ready' && nextRows.length > 0 ? 'ready' : 'error'));
        } else {
          setError(null);
          setPhase('ready');
        }
      } catch (caught) {
        setError(describeApiError(caught));
        setPhase((previous) => (previous === 'ready' ? 'ready' : 'error'));
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [statusFilter, rangeKey, keyword],
  );

  // 筛选条件变化 / 首次进入 → 重新加载第 1 页
  useEffect(() => {
    void load(1, 'initial');
  }, [load]);

  const loadMore = useCallback((): void => {
    if (!hasMoreRef.current || inFlightRef.current) return;
    void load(Math.floor(rows.length / Math.max(1, limit)) + 1, 'more');
  }, [load, rows.length, limit]);

  const showEmpty = phase === 'ready' && rows.length === 0;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={typography.label}>订单</Text>
        <View style={styles.titleRow}>
          <Text style={typography.h2}>订单</Text>
          <Text style={styles.countText}>
            {totalLabel(total) ?? (phase === 'loading' ? '加载中…' : '')}
          </Text>
        </View>
        {asOf ? <Text style={styles.asOf}>数据更新于 {formatDateTimeShort(asOf) ?? ''}</Text> : null}
      </View>

      {/* 筛选区（固定，不随列表滚动） */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterStrip}
        contentContainerStyle={styles.filterStripContent}
      >
        {ORDER_STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.label}
            label={option.label}
            active={statusFilter === option.value}
            disabled={phase === 'loading'}
            onPress={() => setStatusFilter(option.value)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterStrip}
        contentContainerStyle={styles.filterStripContent}
      >
        {RANGE_OPTIONS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            active={rangeKey === option.key}
            disabled={phase === 'loading'}
            onPress={() => setRangeKey(option.key)}
          />
        ))}
      </ScrollView>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={searchText}
          onChangeText={setSearchText}
          placeholder="搜索订单号"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={64}
          returnKeyType="search"
          onSubmitEditing={() => setKeyword(searchText.trim())}
        />
        <Pressable style={styles.searchButton} onPress={() => setKeyword(searchText.trim())}>
          <Text style={styles.searchButtonText}>搜索</Text>
        </Pressable>
        {keyword.length > 0 ? (
          <Pressable
            style={styles.clearButton}
            onPress={() => {
              setSearchText('');
              setKeyword('');
            }}
          >
            <Text style={styles.clearButtonText}>清除</Text>
          </Pressable>
        ) : null}
      </View>

      {rangeHint ? <Text style={styles.hint}>{rangeHint}</Text> : null}
      {warnings.length > 0
        ? warnings.map((warning, index) => (
            <Text key={`${warning}-${index}`} style={styles.hint}>
              · {warningLabel(warning)}
            </Text>
          ))
        : null}

      {/* 错误提示（已有数据时作为顶部条） */}
      {error !== null ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <Pressable style={styles.retryButton} onPress={() => void load(1, 'refresh')}>
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/order/${encodeURIComponent(item.orderNo)}`)}
          >
            <OrderCard row={item} />
          </Pressable>
        )}
        contentContainerStyle={[styles.listContent, { paddingBottom: spacing.xl }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(1, 'refresh')}
            tintColor={colors.accent}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListEmptyComponent={
          phase === 'loading' ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.placeholderText}>正在加载订单…</Text>
            </View>
          ) : showEmpty ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>
                {statusFilter || keyword.length > 0 || rangeKey !== 'default'
                  ? '没有符合条件的订单'
                  : '暂无订单'}
              </Text>
              <Text style={styles.placeholderText}>
                {statusFilter || keyword.length > 0 || rangeKey !== 'default'
                  ? '可以试试放宽筛选条件或清除搜索关键词。'
                  : '当前时间范围内没有订单记录。'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.accent} style={styles.footerLoader} />
          ) : rows.length > 0 && !hasMoreRef.current ? (
            <Text style={styles.listEnd}>已显示全部</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  countText: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
  asOf: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  filterStrip: { maxHeight: 44, flexGrow: 0 },
  filterStripContent: { paddingHorizontal: spacing.lg, alignItems: 'center' },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(37,99,235,0.10)' },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontSize: 12.5, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  searchButton: {
    marginLeft: spacing.sm,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
  clearButton: { marginLeft: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm },
  clearButtonText: { color: colors.textSecondary, fontSize: 13 },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: spacing.lg,
    marginTop: 4,
  },
  errorBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.32)',
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { ...typography.caption, color: colors.danger, flexShrink: 1, marginRight: spacing.sm },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  retryText: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNo: { ...typography.body, fontWeight: '600', flexShrink: 1, marginRight: spacing.sm },
  statusPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  statusText: { fontSize: 11.5, fontWeight: '600' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cardLabel: { ...typography.caption, color: colors.textTertiary },
  cardValue: { ...typography.caption, color: colors.text, flexShrink: 1, marginLeft: spacing.md },
  cardValueMuted: { color: colors.textTertiary },
  placeholder: { alignItems: 'center', paddingVertical: spacing.xxl },
  placeholderTitle: { ...typography.h2, marginBottom: spacing.sm },
  placeholderText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  footerLoader: { marginVertical: spacing.md },
  listEnd: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginVertical: spacing.md },
});
