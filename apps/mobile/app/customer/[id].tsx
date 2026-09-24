/**
 * PHASE MOBILE-06 — 客户详情 + 该客户订单（只读）。
 * 数据源：GET /m/customers/:id、GET /m/customers/:id/orders
 * PII 由服务端脱敏（nameMasked / phoneMasked / emailMasked）；金额按角色下发。
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { describeApiError } from '@/lib/api';
import { formatAmount, formatCount } from '@/lib/format';
import {
  fetchCustomer,
  fetchCustomerOrders,
  type MobileCustomerDetail,
} from '@/lib/mobile-api-extra';
import type { MobileOrderItem } from '@/lib/mobile-api';
import { customerStatusLabel, timeLabel } from '@/lib/bff-view';
import { buildOrderRows, type OrderRow } from '@/lib/orders-view-model';
import { colors, radius, spacing, typography } from '@/theme';

export default function CustomerDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [customer, setCustomer] = useState<MobileCustomerDetail | null>(null);
  const [orders, setOrders] = useState<readonly OrderRow[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (id.length === 0) {
      setError('缺少客户标识');
      setPhase('error');
      return;
    }
    setPhase('loading');
    try {
      const detail = await fetchCustomer(id);
      setCustomer(detail);
      const page = await fetchCustomerOrders(id, { page: 1, limit: 10 });
      setOrders(buildOrderRows(page.items as readonly MobileOrderItem[]));
      setError(null);
      setPhase('ready');
    } catch (caught) {
      setError(describeApiError(caught));
      setPhase('error');
    }
  }, [id]);

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
        <Text style={typography.h2}>客户详情</Text>
      </View>

      {phase === 'loading' ? (
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.placeholderText}>正在加载客户…</Text>
        </View>
      ) : phase === 'error' ? (
        <View style={styles.card}>
          <Text style={typography.h2}>暂时无法获取该客户</Text>
          <Text style={styles.placeholderText}>{error ?? ''}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : customer ? (
        <>
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.name}>
                {customer.nameMasked.trim().length > 0 ? customer.nameMasked : '未记录姓名'}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{customerStatusLabel(customer.status)}</Text>
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>手机号</Text>
              <Text style={styles.value}>{customer.phoneMasked ?? '未记录'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>邮箱</Text>
              <Text style={styles.value}>{customer.emailMasked ?? '未记录'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>来源</Text>
              <Text style={styles.value}>{customer.source}</Text>
            </View>
            {customer.stage ? (
              <View style={styles.row}>
                <Text style={styles.label}>阶段</Text>
                <Text style={styles.value}>{customer.stage}</Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.label}>最近联系</Text>
              <Text style={styles.value}>{timeLabel(customer.lastContactAt) ?? '暂无记录'}</Text>
            </View>
            {customer.tags.length > 0 ? (
              <View style={styles.row}>
                <Text style={styles.label}>标签</Text>
                <Text style={styles.value} numberOfLines={2}>
                  {customer.tags.join('、')}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={typography.h2}>经营摘要</Text>
            <View style={styles.row}>
              <Text style={styles.label}>订单数</Text>
              <Text style={styles.value}>{formatCount(customer.orderCount) ?? '暂无数据'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>会话数</Text>
              <Text style={styles.value}>{formatCount(customer.conversationCount) ?? '暂无数据'}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>待人工处理</Text>
              <Text style={styles.value}>
                {formatCount(customer.pendingHandoffCount) ?? '暂无数据'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>最近订单金额</Text>
              <Text style={[styles.value, customer.lastOrderAmount === null ? styles.muted : null]}>
                {customer.lastOrderAmount === null
                  ? '金额不可见'
                  : formatAmount(customer.lastOrderAmount, customer.lastOrderCurrency) ?? '—'}
              </Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>最近订单时间</Text>
              <Text style={styles.value}>{timeLabel(customer.lastOrderAt) ?? '暂无订单'}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={typography.h2}>最近订单</Text>
            {orders.length === 0 ? (
              <Text style={styles.placeholderText}>该客户暂无订单记录。</Text>
            ) : (
              orders.map((row) => (
                <Pressable
                  key={row.key}
                  style={styles.orderRow}
                  onPress={() => router.push(`/order/${encodeURIComponent(row.orderNo)}`)}
                >
                  <View style={styles.orderMain}>
                    <Text style={styles.orderNo} numberOfLines={1}>
                      {row.orderNo}
                    </Text>
                    <Text style={styles.orderMeta}>
                      {row.statusLabel} · {row.createdLabel}
                    </Text>
                  </View>
                  <Text style={[styles.orderAmount, row.amountLabel === null ? styles.muted : null]}>
                    {row.amountLabel ?? '金额不可见'}
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          <Text style={styles.footnote}>姓名与联系方式已脱敏展示。</Text>
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
  name: { ...typography.body, fontWeight: '700', flexShrink: 1, marginRight: spacing.sm },
  pill: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  pillText: { fontSize: 11.5, color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  label: { ...typography.caption, color: colors.textTertiary },
  value: { ...typography.caption, color: colors.text, flexShrink: 1, marginLeft: spacing.md },
  muted: { color: colors.textTertiary },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  orderMain: { flexShrink: 1, marginRight: spacing.sm },
  orderNo: { ...typography.body },
  orderMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  orderAmount: { ...typography.caption, color: colors.text, fontWeight: '600' },
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
