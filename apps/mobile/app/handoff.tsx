/**
 * PHASE MOBILE-06 — 待人工接待列表（只读）。
 *
 * 数据源：GET /m/handoff（口径 needsHuman && resolvedAt=null，与 /m/home 的
 *         「待处理人工接待」数字完全一致）
 * 只读：本页**不提供**回复/标记已处理等写操作（后端写接口不在本阶段授权范围内）
 * 交互：下拉刷新 + 分页加载 + loading/error/retry/空状态；Safe Area
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
import { warningLabel } from '@/lib/agent-view-model';
import { fetchHandoff, type MobileHandoffItem } from '@/lib/mobile-api-extra';
import { channelLabel, handoffReasonLabel, senderLabel, timeLabel } from '@/lib/bff-view';
import { colors, radius, spacing, typography } from '@/theme';

const PAGE_SIZE = 20;

export default function HandoffScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<readonly MobileHandoffItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [warnings, setWarnings] = useState<readonly string[]>([]);

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
        const response = await fetchHandoff({ page: targetPage, limit: PAGE_SIZE });
        setItems((previous) =>
          targetPage === 1 ? response.items : [...previous, ...response.items],
        );
        setTotal(response.total);
        setLimit(response.limit);
        setWarnings(response.warnings);
        hasMoreRef.current = response.hasMore;
        if (!response.available) {
          setError(response.error ? warningLabel(response.error) : '数据暂时无法获取。');
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
          <Text style={typography.h2}>待人工接待</Text>
        </View>
        <Text style={styles.sub}>
          {total === null ? '正在读取…' : `共 ${total} 个待处理会话`}
          {warnings.length > 0 ? ` · ${warningLabel(warnings[0] ?? '')}` : ''}
        </Text>
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
        keyExtractor={(item) => item.conversationId}
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
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.customerNameMasked.trim().length > 0 ? item.customerNameMasked : '未关联客户'}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{channelLabel(item.channel)}</Text>
              </View>
            </View>
            <Text style={styles.reason}>{handoffReasonLabel(item.handoffReason)}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>转人工时间</Text>
              <Text style={styles.value}>{timeLabel(item.handoffAt) ?? '—'}</Text>
            </View>
            {item.lastMessagePreview !== null ? (
              <View style={styles.msgBox}>
                <Text style={styles.msgMeta}>
                  {senderLabel(item.lastMessageSender)}
                  {timeLabel(item.lastMessageAt) ? ` · ${timeLabel(item.lastMessageAt)}` : ''}
                </Text>
                <Text style={styles.msgText} numberOfLines={3}>
                  {item.lastMessagePreview}
                </Text>
              </View>
            ) : (
              <Text style={styles.noMsg}>该会话暂无消息记录</Text>
            )}
            <Text style={styles.readonly}>只读：回复/处理需在商家后台操作</Text>
          </View>
        )}
        ListEmptyComponent={
          phase === 'loading' ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.placeholderText}>正在加载待处理会话…</Text>
            </View>
          ) : phase === 'error' ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>暂时无法获取</Text>
              <Text style={styles.placeholderText}>请稍后重试。</Text>
            </View>
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>当前没有待人工接待</Text>
              <Text style={styles.placeholderText}>所有会话都已由 AI 正常处理。</Text>
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
  cardTitle: { ...typography.body, fontWeight: '600', flexShrink: 1, marginRight: spacing.sm },
  pill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  pillText: { fontSize: 11.5, color: colors.textSecondary },
  reason: { ...typography.caption, color: colors.warning, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  label: { ...typography.caption, color: colors.textTertiary },
  value: { ...typography.caption, color: colors.text },
  msgBox: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  msgMeta: { ...typography.caption, color: colors.textTertiary },
  msgText: { ...typography.body, marginTop: 2 },
  noMsg: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  readonly: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
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
