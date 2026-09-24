/**
 * PHASE MOBILE-05 — 商品与库存（真实数据，两个分段）。
 *
 * 商品：GET /products（复用既有受保护端点，**白名单消费**：只读 name/sku/stockQuantity/status 等；
 *       价格字段一律不读取、不渲染；isDeleted 由本端过滤；无分页时单屏最多 100 条并明示截断）
 * 库存：GET /m/inventory（复用 get_product_inventory 工具：threshold / lowStock / outOfStock）
 *
 * 硬约束：
 *   - 不做搜索（后端 GET /products 无搜索参数；不发明接口）
 *   - 数值 null → 「暂无数据」；空数组 → 合法空状态；**禁止用 0 冒充**
 *   - JWT 由 axios 拦截器注入；不传 tenantId/userId/role
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useInventory } from '@/hooks/use-inventory';
import { useProducts } from '@/hooks/use-products';
import type { InventoryRow, ProductRow } from '@/lib/catalog-view-model';
import { colors, radius, spacing, typography } from '@/theme';

type Segment = 'products' | 'inventory';

const NO_DATA = '暂无数据';

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.segment, active ? styles.segmentActive : null]} onPress={onPress}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function ErrorBar({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorBar}>
      <Text style={styles.errorText} numberOfLines={2}>
        {message}
      </Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryText}>重新加载</Text>
      </Pressable>
    </View>
  );
}

function ProductCard({ row }: { row: ProductRow }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {row.name}
        </Text>
        <View style={[styles.pill, row.isLowStock ? styles.pillWarn : null]}>
          <Text style={[styles.pillText, row.isLowStock ? styles.pillTextWarn : null]}>
            {row.statusLabel}
          </Text>
        </View>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>SKU</Text>
        <Text style={[styles.cardValue, row.skuLabel === null ? styles.cardValueMuted : null]}>
          {row.skuLabel ?? '无 SKU'}
        </Text>
      </View>
      <View style={styles.cardRow}>
        <Text style={styles.cardLabel}>库存</Text>
        <Text style={[styles.cardValue, row.stockLabel === null ? styles.cardValueMuted : null]}>
          {row.stockLabel ?? NO_DATA}
        </Text>
      </View>
    </View>
  );
}

function StockRow({ row, tone }: { row: InventoryRow; tone: string }) {
  return (
    <View style={styles.stockRow}>
      <View style={styles.stockMain}>
        <Text style={styles.stockName} numberOfLines={1}>
          {row.name}
        </Text>
        {row.skuLabel ? <Text style={styles.stockSku}>SKU {row.skuLabel}</Text> : null}
      </View>
      <Text style={[styles.stockValue, { color: tone }]}>
        {row.stockLabel === null ? '—' : `剩 ${row.stockLabel}`}
      </Text>
    </View>
  );
}

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('products');

  // 懒加载：仅在对应分段打开时请求；商品列表的「低库存」标记复用库存阈值
  const inventory = useInventory(segment === 'inventory');
  const products = useProducts(segment === 'products', inventory.threshold);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={typography.label}>商品目录</Text>
        <Text style={[typography.h2, { marginTop: spacing.xs }]}>商品与库存</Text>
        <View style={styles.segmentRow}>
          <SegmentButton
            label="商品"
            active={segment === 'products'}
            onPress={() => setSegment('products')}
          />
          <SegmentButton
            label="库存预警"
            active={segment === 'inventory'}
            onPress={() => setSegment('inventory')}
          />
        </View>
      </View>

      {segment === 'products' ? (
        <FlatList
          data={products.list.rows}
          keyExtractor={(row) => row.key}
          renderItem={({ item }) => <ProductCard row={item} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={products.refreshing}
              onRefresh={products.reload}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View>
              {products.error !== null ? (
                <ErrorBar message={products.error} onRetry={products.reload} />
              ) : null}
              {products.phase === 'ready' ? (
                <Text style={styles.hint}>
                  共 {products.list.activeCount} 件在售商品
                  {products.list.hiddenCount > 0
                    ? `（仅显示前 ${products.list.rows.length} 件；当前接口不支持分页）`
                    : ''}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            products.phase === 'loading' || products.phase === 'idle' ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.placeholderText}>正在加载商品…</Text>
              </View>
            ) : products.phase === 'error' ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderTitle}>暂时无法获取商品</Text>
                <Text style={styles.placeholderText}>请稍后重试。</Text>
              </View>
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderTitle}>暂无商品</Text>
                <Text style={styles.placeholderText}>
                  {products.list.rawCount > 0
                    ? '已删除的商品不会在此展示。'
                    : '店铺还没有商品记录。'}
                </Text>
              </View>
            )
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={inventory.refreshing}
              onRefresh={inventory.reload}
              tintColor={colors.accent}
            />
          }
        >
          {inventory.error !== null ? (
            <ErrorBar message={inventory.error} onRetry={inventory.reload} />
          ) : null}

          {inventory.phase === 'loading' || inventory.phase === 'idle' ? (
            <View style={styles.placeholder}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.placeholderText}>正在加载库存…</Text>
            </View>
          ) : inventory.phase === 'error' ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>暂时无法获取库存</Text>
              <Text style={styles.placeholderText}>请稍后重试。</Text>
            </View>
          ) : !inventory.summary.available ? (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderTitle}>{NO_DATA}</Text>
              <Text style={styles.placeholderText}>库存数据当前不可用。</Text>
            </View>
          ) : (
            <>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>低库存商品</Text>
                    <Text style={[styles.summaryValue, { color: colors.warning }]}>
                      {inventory.summary.lowStockCountLabel === null
                        ? NO_DATA
                        : `${inventory.summary.lowStockCountLabel} 件`}
                    </Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>缺货商品</Text>
                    <Text style={[styles.summaryValue, { color: colors.danger }]}>
                      {inventory.summary.outOfStockCountLabel === null
                        ? NO_DATA
                        : `${inventory.summary.outOfStockCountLabel} 件`}
                    </Text>
                  </View>
                </View>
                <Text style={styles.hint}>
                  {inventory.summary.thresholdLabel === null
                    ? '统计阈值：暂无数据'
                    : `统计阈值：库存 ≤ ${inventory.summary.thresholdLabel}`}
                </Text>
                {inventory.summary.truncated ? (
                  <Text style={styles.hint}>低库存列表已达服务端返回上限，实际数量更多。</Text>
                ) : null}
              </View>

              <View style={styles.sectionCard}>
                <Text style={typography.h2}>低库存商品</Text>
                {inventory.summary.lowStockRows.length === 0 ? (
                  <Text style={styles.emptyText}>当前没有需要补货的商品</Text>
                ) : (
                  inventory.summary.lowStockRows.map((row) => (
                    <StockRow key={row.key} row={row} tone={colors.warning} />
                  ))
                )}
              </View>

              <View style={styles.sectionCard}>
                <Text style={typography.h2}>缺货商品</Text>
                {inventory.summary.outOfStockRows.length === 0 ? (
                  <Text style={styles.emptyText}>当前没有缺货商品</Text>
                ) : (
                  inventory.summary.outOfStockRows.map((row) => (
                    <StockRow key={row.key} row={row} tone={colors.danger} />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  segmentRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: 'rgba(37,99,235,0.10)' },
  segmentText: { fontSize: 13, color: colors.textSecondary },
  segmentTextActive: { color: colors.primary, fontWeight: '700' },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  hint: { ...typography.caption, color: colors.textTertiary, marginTop: spacing.sm },
  errorBar: {
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
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardTitle: { ...typography.body, fontWeight: '600', flexShrink: 1, marginRight: spacing.sm },
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
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cardLabel: { ...typography.caption, color: colors.textTertiary },
  cardValue: { ...typography.caption, color: colors.text, flexShrink: 1, marginLeft: spacing.md },
  cardValueMuted: { color: colors.textTertiary },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: { flexDirection: 'row' },
  summaryCell: { flex: 1 },
  summaryLabel: { ...typography.caption, color: colors.textSecondary },
  summaryValue: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  sectionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stockMain: { flexShrink: 1, marginRight: spacing.sm },
  stockName: { ...typography.body },
  stockSku: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
  stockValue: { ...typography.caption, fontWeight: '600' },
  emptyText: { ...typography.body, color: colors.textTertiary, marginTop: spacing.sm },
  placeholder: { alignItems: 'center', paddingVertical: spacing.xxl },
  placeholderTitle: { ...typography.h2, marginBottom: spacing.sm },
  placeholderText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
