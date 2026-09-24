/**
 * PHASE MOBILE-06 — 订单详情（只读，含真实商品明细）。
 * 数据源：GET /m/orders/:key（key 为订单号或内部 id，服务端强制租户约束）
 * 金额按角色下发：缺失显示「金额不可见」，**绝不用 0 冒充**
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { describeApiError } from '@/lib/api';
import { formatAmount, formatCount } from '@/lib/format';
import { fetchOrderDetail, type MobileOrderDetailResponse } from '@/lib/mobile-api-extra';
import { orderStatusLabel, orderStatusTone, type Tone } from '@/lib/orders-view-model';
import { timeLabel } from '@/lib/bff-view';
import { colors, radius, spacing, typography } from '@/theme';

function toneColor(tone: Tone): string {
  if (tone === 'success') return colors.success;
  if (tone === 'warning') return colors.warning;
  if (tone === 'danger') return colors.danger;
  if (tone === 'accent') return colors.accent;
  return colors.textSecondary;
}

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string }>();
  const key = typeof params.key === 'string' ? params.key : '';

  const [data, setData] = useState<MobileOrderDetailResponse | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (key.length === 0) {
      setError('缺少订单标识');
      setPhase('error');
      return;
    }
    setPhase('loading');
    try {
      const response = await fetchOrderDetail(key);
      setData(response);
      setError(null);
      setPhase('ready');
    } catch (caught) {
      setError(describeApiError(caught));
      setPhase('error');
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
    >
      <View style={styles.titleRow}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        <Text style={typography.h2}>订单详情</Text>
      </View>

      {phase === 'loading' ? (
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.placeholderText}>正在加载订单…</Text>
        </View>
      ) : phase === 'error' ? (
        <View style={styles.card}>
          <Text style={typography.h2}>暂时无法获取该订单</Text>
          <Text style={styles.placeholderText}>{error ?? ''}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : data ? (
        <>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.orderNo} numberOfLines={1}>
                {data.orderNo}
              </Text>
              <View style={[styles.pill, { borderColor: toneColor(orderStatusTone(data.status)) }]}>
                <Text style={[styles.pillText, { color: toneColor(orderStatusTone(data.status)) }]}>
                  {orderStatusLabel(data.status)}
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>客户</Text>
              <Text style={styles.value}>{data.customerNameMasked || '未关联客户'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>下单时间</Text>
              <Text style={styles.value}>{timeLabel(data.createdAt) ?? '—'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>付款时间</Text>
              <Text style={styles.value}>{timeLabel(data.paidAt) ?? '未付款'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>金额</Text>
              <Text style={[styles.value, data.amount === null ? styles.muted : null]}>
                {data.amount === null ? '金额不可见' : formatAmount(data.amount, data.currency) ?? '—'}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={typography.h2}>
              商品明细（{formatCount(data.itemCount) ?? '0'} 项）
            </Text>
            {data.items.length === 0 ? (
              <Text style={styles.placeholderText}>该订单没有商品明细记录。</Text>
            ) : (
              data.items.map((item, index) => (
                <View key={`${item.name}-${index}`} style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {item.sku ? `SKU ${item.sku}` : '无 SKU'}
                      {item.quantity !== null ? ` · ×${item.quantity}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.itemAmount, item.total === null ? styles.muted : null]}>
                    {item.total === null
                      ? '不可见'
                      : formatAmount(item.total, data.currency) ?? '—'}
                  </Text>
                </View>
              ))
            )}
            {data.warnings.length > 0 ? (
              <Text style={styles.placeholderText}>部分明细被截断显示。</Text>
            ) : null}
          </View>

          <Text style={styles.footnote}>
            数据来源：订单记录（items 字段）。金额按账号权限展示。
          </Text>
        </>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>暂无数据</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  back: { marginRight: spacing.md, paddingVertical: 4, paddingRight: spacing.sm },
  backText: { color: colors.primary, fontSize: 15 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNo: { ...typography.body, fontWeight: '700', flexShrink: 1, marginRight: spacing.sm },
  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  pillText: { fontSize: 11.5, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  label: { ...typography.caption, color: colors.textTertiary },
  value: { ...typography.caption, color: colors.text, flexShrink: 1, marginLeft: spacing.md },
  muted: { color: colors.textTertiary },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemMain: { flexShrink: 1, marginRight: spacing.sm },
  itemName: { ...typography.body },
  itemMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  itemAmount: { ...typography.caption, color: colors.text, fontWeight: '600' },
  placeholder: { alignItems: 'center', paddingVertical: spacing.xxl },
  placeholderTitle: { ...typography.h2 },
  placeholderText: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  retry: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  footnote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
});
