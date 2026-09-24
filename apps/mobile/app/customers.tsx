/**
 * PHASE MOBILE-06 — 客户列表（只读，PII 已由服务端脱敏）。
 * 数据源：GET /m/customers?page&limit&keyword
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { describeApiError } from '@/lib/api';
import { formatCount } from '@/lib/format';
import { fetchCustomers, type MobileCustomerListItem } from '@/lib/mobile-api-extra';
import { customerStatusLabel, timeLabel } from '@/lib/bff-view';
import { colors, radius, spacing, typography } from '@/theme';

const PAGE_SIZE = 20;

export default function CustomersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [searchText, setSearchText] = useState('');
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<readonly MobileCustomerListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
        const response = await fetchCustomers({
          page: targetPage,
          limit: PAGE_SIZE,
          ...(keyword.length > 0 ? { keyword } : {}),
        });
        setItems((previous) =>
          targetPage === 1 ? response.items : [...previous, ...response.items],
        );
        setTotal(response.total);
        setLimit(response.limit);
        hasMoreRef.current = response.hasMore;
        if (!response.available) {
          setError('数据暂时无法获取，请稍后再试。');
          setPhase((previous) => (previous === 'ready' ? 'ready' : 'error'));
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
    [keyword],
  );

  useEffect(() => {
    void load(1, 'initial');
  }, [load]);

  const loadMore = useCallback((): void => {
    if (!hasMoreRef.current || inFlightRef.current) return;
    void load(Math.floor(items.length / Math.max(1, limit)) + 1, 'more');
  }, [load, items.length, limit]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Text style={styles.backText}>‹ 返回</Text>
          </Pressable>
          <Text style={typography.h2}>客户</Text>
          <Text style={styles.count}>
            {total === null ? '' : `共 ${formatCount(total) ?? '—'} 位`}
          </Text>
        </View>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索姓名 / 手机号 / 邮箱"
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
              style={styles.clear}
              onPress={() => {
                setSearchText('');
                setKeyword('');
              }}
            >
              <Text style={styles.clearText}>清除</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {error !== null ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <Pressable style={styles.retry} onPress={() => void load(1, 'refresh')}>
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(1, 'refresh')}
            tintColor={colors.accent}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/customer/${encodeURIComponent(item.id)}`)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.name} numberOfLines={1}>
                {item.nameMasked.trim().length > 0 ? item.nameMasked : '未记录姓名'}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{customerStatusLabel(item.status)}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>订单数</Text>
              <Text style={styles.value}>{formatCount(item.orderCount) ?? '暂无数据'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>最近订单</Text>
              <Text style={styles.value}>
                {timeLabel(item.lastOrderAt) ?? '暂无订单'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>联系方式</Text>
              <Text style={styles.value} numberOfLines={1}>
                {item.phoneMasked ?? item.emailMasked ?? '未记录'}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          phase === 'loading' ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.placeholderText}>正在加载客户…</Text>
            </View>
          ) : phase === 'error' ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>暂时无法获取客户</Text>
              <Text style={styles.placeholderText}>请稍后重试。</Text>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>
                {keyword.length > 0 ? '没有匹配的客户' : '暂无客户'}
              </Text>
              <Text style={styles.placeholderText}>
                {keyword.length > 0 ? '可以换个关键词或清除搜索。' : '店铺还没有客户记录。'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator size="small" color={colors.accent} style={styles.footer} />
          ) : items.length > 0 && !hasMoreRef.current ? (
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
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  back: { marginRight: spacing.md, paddingVertical: 4, paddingRight: spacing.sm },
  backText: { color: colors.primary, fontSize: 15 },
  count: { ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  input: {
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
  clear: { marginLeft: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm },
  clearText: { color: colors.textSecondary, fontSize: 13 },
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
  retry: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
  },
  retryText: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { ...typography.body, fontWeight: '600', flexShrink: 1, marginRight: spacing.sm },
  pill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  pillText: { fontSize: 11.5, color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label: { ...typography.caption, color: colors.textTertiary },
  value: { ...typography.caption, color: colors.text, flexShrink: 1, marginLeft: spacing.md },
  placeholder: { alignItems: 'center', paddingVertical: spacing.xxl },
  placeholderTitle: { ...typography.h2, marginBottom: spacing.sm },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  footer: { marginVertical: spacing.md },
  listEnd: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
});
