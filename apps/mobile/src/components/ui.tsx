/**
 * WANLAN AI — Mobile 统一 UI 组件库（成品级 Design System · Light）。
 * 零额外依赖，仅基于 react-native + src/theme。
 * 所有屏幕共享同一套 Card / Badge / Button / 状态组件，避免各自定义颜色。
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors,
  radius,
  shadows,
  spacing,
  toneColor,
  typography,
  type Tone,
} from '@/theme';

/* ----------------------------- Screen ----------------------------- */
export function Screen({
  children,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[styles.screen, style]}
      contentContainerStyle={[{ paddingTop: insets.top }, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

/* -------------------------- SectionHeader -------------------------- */
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={typography.label}>{eyebrow}</Text> : null}
      <View style={styles.titleRow}>
        <Text style={[typography.title, { marginTop: eyebrow ? spacing.xs : 0 }]}>{title}</Text>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
      {subtitle ? <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

/* ------------------------------- Card ------------------------------- */
export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

/* ------------------------------ Badge ------------------------------ */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <View style={[styles.badge, { borderColor: toneColor(tone), backgroundColor: `${toneColor(tone)}1F` }]}>
      <Text style={[styles.badgeText, { color: toneColor(tone) }]}>{children}</Text>
    </View>
  );
}

/* ------------------------------ Button ------------------------------ */
export function Button({
  variant = 'primary',
  disabled,
  onPress,
  children,
  loading,
}: {
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
  onPress?: () => void;
  children: React.ReactNode;
  loading?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        isPrimary ? styles.btnPrimary : styles.btnGhost,
        pressed && !disabled ? styles.btnPressed : null,
        disabled ? styles.btnDisabled : null,
      ]}
    >
      {loading ? <ActivityIndicator color={isPrimary ? colors.onAccent : colors.text} /> : <Text style={isPrimary ? styles.btnTextPrimary : styles.btnTextGhost}>{children}</Text>}
    </Pressable>
  );
}

/* ------------------------------ Input ------------------------------ */
export function Input({
  value,
  onChangeText,
  placeholder,
  secure,
  keyboard,
  autoCap,
  autoCorrect,
  multiline,
  maxLength,
  editable,
  inputStyle,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: 'default' | 'email-address' | 'numeric';
  autoCap?: 'none' | 'words';
  autoCorrect?: boolean;
  multiline?: boolean;
  maxLength?: number;
  editable?: boolean;
  inputStyle?: StyleProp<TextStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textTertiary}
      secureTextEntry={secure}
      keyboardType={keyboard}
      autoCapitalize={autoCap ?? 'none'}
      autoCorrect={autoCorrect ?? false}
      multiline={multiline}
      maxLength={maxLength}
      editable={editable}
      style={[styles.input, inputStyle]}
    />
  );
}

/* ----------------------------- Skeleton ----------------------------- */
export function Skeleton({ height = 16, width, radius: r = radius.md }: { height?: number; width?: DimensionValue; radius?: number }) {
  return <View style={[styles.skeleton, { height, width: width ?? '100%', borderRadius: r }]} />;
}

/* ---------------------------- EmptyState ---------------------------- */
export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <View style={styles.state}>
      <Text style={[typography.h2, { textAlign: 'center' }]}>{title}</Text>
      {description ? <Text style={[typography.caption, { marginTop: spacing.sm, textAlign: 'center', color: colors.textSecondary }]}>{description}</Text> : null}
    </View>
  );
}

/* ---------------------------- ErrorState ---------------------------- */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBar}>
      <Text style={[styles.errorText, { flexShrink: 1, marginRight: spacing.sm }]} numberOfLines={2}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>重新加载</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ---------------------------- MetricTile ---------------------------- */
export function MetricTile({
  label,
  value,
  tone,
  delta,
  note,
  onPress,
}: {
  label: string;
  value: string;
  tone?: Tone;
  delta?: string | null;
  note?: string | null;
  onPress?: () => void;
}) {
  return (
    <Pressable disabled={!onPress} style={styles.metric} onPress={onPress}>
      <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone ? toneColor(tone) : colors.text }]}>{value}</Text>
      {delta ? <Text style={[typography.caption, { marginTop: 2 }]}>{delta}</Text> : null}
      {note ? <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>{note}</Text> : null}
    </Pressable>
  );
}

/* ------------------------------ InfoRow ------------------------------ */
export function InfoRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[typography.caption, { color: colors.textTertiary }]}>{label}</Text>
      <Text style={[typography.caption, { color: muted ? colors.textTertiary : colors.text, flexShrink: 1, marginLeft: spacing.md }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------ Styles ------------------------------ */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  headerRight: { marginLeft: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    ...shadows.sm,
  },
  cardPadded: { padding: spacing.lg, marginBottom: spacing.lg },
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: spacing.sm },
  badgeText: { fontSize: 11.5, fontWeight: '600' },
  btn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnPrimary: { backgroundColor: colors.primary },
  btnGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnPressed: { opacity: 0.85, backgroundColor: colors.primary },
  btnDisabled: { opacity: 0.45 },
  btnTextPrimary: { color: colors.onAccent, fontWeight: '700', fontSize: 15 },
  btnTextGhost: { color: colors.text, fontWeight: '600', fontSize: 15 },
  input: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    backgroundColor: colors.card,
    fontSize: 15,
  },
  skeleton: { backgroundColor: 'rgba(100,116,139,0.12)' },
  state: { alignItems: 'center', paddingVertical: spacing.xxl },
  errorBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.30)',
    backgroundColor: 'rgba(220,38,38,0.07)',
    borderRadius: radius.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: { ...typography.caption, color: colors.danger },
  retryBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing.md },
  retryText: { color: colors.text, fontSize: 12.5, fontWeight: '600' },
  metric: {
    width: '48.5%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  metricValue: { fontSize: 22, fontWeight: '700', marginTop: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
});
