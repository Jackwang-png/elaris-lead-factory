/**
 * PHASE MOBILE-06 — 通知列表（只读）。
 * 数据源：GET /m/notifications（**来源为 AuditLog**：本库不存在 Notification 实体与已读状态；
 *         服务端已剔除 read/actorId/actorLabel 等假字段与内部标识）
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { describeApiError } from '@/lib/api';
import { fetchNotifications, type MobileNotificationItem } from '@/lib/mobile-api-extra';
import { timeLabel } from '@/lib/bff-view';
import { colors, radius, spacing, typography } from '@/theme';

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<readonly MobileNotificationItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [recent24h, setRecent24h] = useState<number | null>(null);
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
        const response = await fetchNotifications({ page: targetPage, limit: PAGE_SIZE });
        setItems((previous) =>
          targetPage === 1 ? response.items : [...previous, ...response.items],
        );
        setTotal(response.total);
        setRecent24h(response.recent24hCount);
        setLimit(response.limit);
        hasMoreRef.current = response.hasMore;
        setError(null);
        setPhase('ready');
      } catch (caught) {
        setError(describeApiError(caught));
        setPhase((previous) => (previous === 'ready' ? 'ready' : 'error'));
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [],
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
          <Text style={typography.h2}>通知</Text>
        </View>
        <Text style={styles.sub}>
          {total === null ? '正在读取…' : `共 ${total} 条记录`}
          {recent24h === null ? '' : ` · 近 24 小时 ${recent24h} 条`}
        </Text>
        <Text style={styles.note}>来源：系统操作记录（本系统暂未提供已读状态）</Text>
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
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <View style={[styles.pill, item.success ? null : styles.pillWarn]}>
                <Text style={[styles.pillText, item.success ? null : styles.pillTextWarn]}>
                  {item.success ? '成功' : '失败'}
                </Text>
              </View>
            </View>
            <Text style={styles.resource} numberOfLines={2}>
              {item.resource}
            </Text>
            <Text style={styles.time}>{timeLabel(item.createdAt) ?? '—'}</Text>
          </View>
        )}
        ListEmptyComponent={
          phase === 'loading' ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.placeholderText}>正在加载通知…</Text>
            </View>
          ) : phase === 'error' ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>暂时无法获取通知</Text>
              <Text style={styles.placeholderText}>请稍后重试。</Text>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>暂无通知记录</Text>
              <Text style={styles.placeholderText}>系统还没有产生操作记录。</Text>
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
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  note: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
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
  title: { ...typography.body, fontWeight: '600', flexShrink: 1, marginRight: spacing.sm },
  pill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  pillWarn: { borderColor: colors.warning },
  pillText: { fontSize: 11.5, color: colors.textSecondary },
  pillTextWarn: { color: colors.warning, fontWeight: '600' },
  resource: { ...typography.caption, color: colors.textSecondary, marginTop: 6 },
  time: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
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
