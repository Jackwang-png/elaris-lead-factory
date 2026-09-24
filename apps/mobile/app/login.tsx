/**
 * 登录 — 复用既有账号体系（POST /auth/login），不创建第二套用户系统。
 * token 存 expo-secure-store；401 由 api client 统一清理。
 * 视觉：统一设计系统（Card / Input / Button / ErrorState）。
 */
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';
import { Button, Input } from '@/components/ui';
import { describeApiError } from '@/lib/api';
import { login } from '@/lib/mobile-api';
import { notifySessionChanged, saveSession } from '@/lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim(), password);
      await saveSession(result.accessToken, {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name ?? null,
        tenantId: result.user.tenantId,
        role: result.user.role,
      });
      await notifySessionChanged();
      router.replace('/');
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: spacing.xl,
          paddingTop: insets.top + spacing.xl,
          paddingBottom: insets.bottom + spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 品牌标识 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.onAccent, fontWeight: '800', fontSize: 20 }}>W</Text>
          </View>
          <Text style={[typography.title, { fontSize: 22 }]}>WANLAN AI</Text>
        </View>

        <Text style={typography.label}>商家登录</Text>
        <Text style={[typography.title, { marginTop: spacing.xs }]}>商家登录</Text>
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          使用你的万澜商家账号登录。
        </Text>

        <Input
          value={email}
          onChangeText={setEmail}
          placeholder="邮箱"
          keyboard="email-address"
          maxLength={128}
        />
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="密码"
          secure
          maxLength={128}
        />

        {error ? (
          <View style={{ marginTop: spacing.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.32)', backgroundColor: 'rgba(239,68,68,0.10)', borderRadius: radius.md, padding: spacing.sm }}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: spacing.xl }}>
          <Button loading={loading} disabled={!canSubmit} onPress={handleSubmit}>
            登录
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
