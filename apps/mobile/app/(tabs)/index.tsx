/**
 * PHASE MOBILE-04 — 首页（真实数据，0 mock）。
 *
 * 数据流：SecureStore(JWT) → GET /m/home?sections=overview,inventory → buildHomeViewModel → 渲染
 *
 * 硬约束：
 *   - 所有业务数字来自服务端响应；后端返回 null 一律显示「暂无数据」，**不用 0 冒充**
 *   - 不发送 tenantId / userId / role（由服务端从 JWT 解析）
 *   - 首屏只拉 overview + inventory（不为一屏好看把 alerts / trend 一起拉上来）
 *   - 401 由 api 拦截器清除 SecureStore + 会话事件 → RootLayout 回落 /login
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AuthProfile, getProfile } from '@/lib/auth';
import { buildHomeViewModel, type HomeInventorySummary, type HomeMetric } from '@/lib/home-view-model';
import { formatDateTimeShort } from '@/lib/format';
import { useHomeData } from '@/hooks/use-home-data';
import { colors, radius, spacing, typography } from '@/theme';

const NO_DATA = '暂无数据';

function greetingFor(hour: number): string {
  if (hour < 6) return '凌晨好';
  if (hour < 12) return '早上好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function toneColor(tone: HomeMetric['tone']): string {
  if (tone === 'accent') return colors.accent;
  if (tone === 'warning') return colors.warning;
  return colors.text;
}

/* ------------------------------- 组件 ------------------------------- */

function MetricCard({
  metric,
  loading,
  onPress,
}: {
  metric: HomeMetric;
  loading: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.metricCard} onPress={onPress} disabled={onPress === undefined}>
      <Text style={styles.metricLabel}>{metric.label}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} style={styles.metricLoading} />
      ) : metric.value === null ? (
        <Text style={styles.metricEmpty}>{NO_DATA}</Text>
      ) : (
        <Text style={[styles.metricValue, { color: toneColor(metric.tone) }]} numberOfLines={1}>
          {metric.value}
        </Text>
      )}
      {!loading && metric.delta !== null ? <Text style={styles.metricDelta}>{metric.delta}</Text> : null}
      {!loading && metric.note ? <Text style={styles.metricNote}>{metric.note}</Text> : null}
    </Pressable>
  );
}

function InventoryStat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string | null;
  suffix: string;
  tone: string;
}) {
  return (
    <View style={styles.inventoryStat}>
      <Text style={styles.inventoryStatLabel}>{label}</Text>
      <Text style={[styles.inventoryStatValue, { color: value === null ? colors.textTertiary : tone }]}>
        {value === null ? NO_DATA : `${value} ${suffix}`}
      </Text>
    </View>
  );
}

function InventoryCard({
  summary,
  loading,
}: {
  summary: HomeInventorySummary;
  loading: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={typography.h2}>库存预警</Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} style={styles.inlineLoader} />
      ) : !summary.available ? (
        <Text style={styles.emptyText}>{NO_DATA}</Text>
      ) : (
        <View style={{ marginTop: spacing.md }}>
          <View style={styles.inventoryRow}>
            <InventoryStat label="低库存商品" value={summary.lowStockCount} suffix="件" tone={colors.warning} />
            <InventoryStat label="缺货商品" value={summary.outOfStockCount} suffix="件" tone={colors.danger} />
          </View>
          {summary.threshold !== null ? (
            <Text style={styles.caption}>统计阈值：库存 ≤ {summary.threshold}</Text>
          ) : null}

          {summary.topLowStock.length === 0 ? (
            <Text style={styles.emptyText}>当前没有需要补货的商品</Text>
          ) : (
            summary.topLowStock.map((item) => (
              <View key={item.id} style={styles.stockRow}>
                <Text style={styles.stockName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.stockQty}>{item.stock === null ? '—' : `剩 ${item.stock}`}</Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

/* ------------------------------- 页面 ------------------------------- */

export default function HomeScreen() {
  const home = useHomeData();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    let mounted = true;
    void getProfile().then((next) => {
      if (mounted) setProfile(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const viewModel = useMemo(() => buildHomeViewModel(home.data), [home.data]);
  const loading = home.phase === 'loading';

  // 账号信息只使用 SecureStore 中已有的真实字段；缺失则显示通用文案，不虚构店铺名。
  const accountLabel = profile?.name?.trim() || profile?.email || '我的店铺';
  const accountSub = profile?.email && profile.name?.trim() ? profile.email : null;
  const updatedAt = formatDateTimeShort(home.asOf);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      refreshControl={
        <RefreshControl
          refreshing={home.refreshing}
          onRefresh={home.reload}
          tintColor={colors.accent}
          titleColor={colors.textSecondary}
        />
      }
    >
      {/* 顶部：账号/店铺基础信息 + 数据时间 */}
      <View style={styles.header}>
        <Text style={typography.label}>WANLAN AI</Text>
        <Text style={[typography.title, { marginTop: spacing.xs }]}>
          {greetingFor(new Date().getHours())}，{accountLabel}
        </Text>
        {accountSub !== null ? <Text style={styles.accountSub}>{accountSub}</Text> : null}
        {updatedAt !== null ? <Text style={styles.asOf}>数据更新于 {updatedAt}</Text> : null}
        {viewModel.dataWindowLabel !== null ? (
          <Text style={styles.asOf}>统计窗口 {viewModel.dataWindowLabel}</Text>
        ) : null}
      </View>

      {/* AI 快捷入口：一键进入 AI 问经营 */}
      <Pressable
        onPress={() => router.push('/agent')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: 'rgba(37,99,235,0.06)',
          borderRadius: radius.lg,
          padding: spacing.lg,
          marginBottom: spacing.lg,
        }}
      >
        <View style={{ flexShrink: 1, marginRight: spacing.sm }}>
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>AI 员工</Text>
          <Text style={[typography.h2, { marginTop: 2 }]}>帮我看看今天经营情况</Text>
        </View>
        <Text style={{ color: colors.primary, fontSize: 22 }}>›</Text>
      </Pressable>

      {/* 降级提示：部分段落不可用，但其它指标仍可信 */}
      {home.degraded ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>部分数据暂时不可用，其余指标不受影响。</Text>
        </View>
      ) : null}

      {/* 错误（含「已有数据但刷新失败」） */}
      {home.error !== null ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{home.error}</Text>
          <Pressable style={styles.retryButton} onPress={home.reload}>
            <Text style={styles.retryText}>重新加载</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 无数据时的错误态 */}
      {home.phase === 'error' && home.data === null ? (
        <View style={styles.card}>
          <Text style={typography.h2}>暂时无法获取经营数据</Text>
          <Text style={styles.emptyText}>请检查网络连接后重试。</Text>
        </View>
      ) : null}

      {/* 核心经营指标（优先） */}
      <View style={styles.metricsGrid}>
        {viewModel.metrics.map((metric) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            loading={loading}
            onPress={
              metric.key === 'pendingHandoffCount' ? () => router.push('/handoff') : undefined
            }
          />
        ))}
      </View>

      {/* 库存异常（独立卡片） */}
      <InventoryCard summary={viewModel.inventory} loading={loading} />

      <Text style={styles.footerNote}>
        以上数据均为只读查询结果，不含演示数据。下拉可刷新。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  accountSub: { ...typography.caption, marginTop: spacing.xs },
  asOf: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  banner: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.35)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: { ...typography.caption, color: colors.warning },
  errorCard: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.32)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { ...typography.caption, color: colors.danger, flexShrink: 1, marginRight: spacing.sm },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  retryText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  metricCard: {
    width: '48.5%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  metricValue: { fontSize: 22, fontWeight: '700', marginTop: spacing.xs },
  metricEmpty: { fontSize: 14, color: colors.textTertiary, marginTop: spacing.sm },
  metricDelta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 4 },
  metricNote: { fontSize: 10.5, color: colors.textTertiary, marginTop: 2 },
  metricLoading: { alignItems: 'flex-start', marginTop: spacing.sm },
  inventoryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  inventoryStat: { flex: 1 },
  inventoryStatLabel: { ...typography.caption, color: colors.textSecondary },
  inventoryStatValue: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  caption: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  emptyText: { ...typography.body, color: colors.textTertiary, marginTop: spacing.sm },
  stockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stockName: { ...typography.body, flexShrink: 1, marginRight: spacing.sm },
  stockQty: { ...typography.caption, color: colors.warning, fontWeight: '600' },
  inlineLoader: { marginTop: spacing.md, alignItems: 'flex-start' },
  footerNote: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
});
