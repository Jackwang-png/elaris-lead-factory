/**
 * Root layout：主题 + 会话门禁 + Stack 路由。
 *
 * 会话来源：expo-secure-store（见 src/lib/auth.ts）。
 * 未登录 → /login；已登录 → (tabs)。
 */
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { colors } from '@/theme';
import { AuthProfile, getProfile, subscribeSession } from '@/lib/auth';

export default function RootLayout() {
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [ready, setReady] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const current = await getProfile();
      if (!mounted) return;
      setProfile(current);
      setReady(true);
    })();
    const unsubscribe = subscribeSession((next) => setProfile(next));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inAuthGroup = segments[0] === 'login';
    if (!profile && !inAuthGroup) {
      router.replace('/login');
    } else if (profile && inAuthGroup) {
      router.replace('/');
    }
  }, [ready, profile, segments, router]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}
