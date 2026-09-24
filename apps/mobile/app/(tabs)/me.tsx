/**
 * 我的 — 展示当前登录账号 + 退出登录。账号信息来自 SecureStore 会话（服务端 user 字段）。
 * 视觉：统一设计系统（SectionHeader / Card / InfoRow）。
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';
import { Card, InfoRow, SectionHeader } from '@/components/ui';
import { AuthProfile, clearSession, getProfile, notifySessionChanged } from '@/lib/auth';

function NavRow({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        backgroundColor: colors.card,
        padding: spacing.md,
        marginBottom: spacing.sm,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{title}</Text>
        <Text style={[typography.caption, { marginTop: 2 }]}>{subtitle}</Text>
      </View>
      <Text style={{ color: colors.textTertiary, fontSize: 18, marginLeft: spacing.sm }}>›</Text>
    </Pressable>
  );
}

export default function MeScreen() {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    void (async () => setProfile(await getProfile()))();
  }, []);

  async function handleLogout() {
    await clearSession();
    await notifySessionChanged();
    router.replace('/login');
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg }}
    >
      <SectionHeader eyebrow="账户" title="我的" />

      <Card>
        <Text style={typography.h2}>{profile?.name || profile?.email || '未登录'}</Text>
        {profile ? (
          <>
            <View style={{ marginTop: spacing.sm }}>
              <InfoRow label="邮箱" value={profile.email} />
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <InfoRow label="角色" value={profile.role} />
            </View>
          </>
        ) : null}
      </Card>

      {/* 只读业务入口 */}
      <NavRow title="客户" subtitle="客户列表与详情（已脱敏）" onPress={() => router.push('/customers')} />
      <NavRow title="待人工接待" subtitle="AI 无法处理的会话（只读）" onPress={() => router.push('/handoff')} />
      <NavRow title="通知" subtitle="近期系统操作记录" onPress={() => router.push('/notifications')} />

      <Pressable
        onPress={handleLogout}
        style={{
          marginTop: spacing.xl,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: colors.text, fontWeight: '600' }}>退出登录</Text>
      </Pressable>

      <Text style={[typography.caption, { marginTop: spacing.lg }]}>
        登录状态保存在设备安全存储（iOS Keychain / Android Keystore），不写入普通存储与日志。
      </Text>
    </ScrollView>
  );
}
