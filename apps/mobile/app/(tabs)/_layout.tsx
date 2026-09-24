/**
 * Bottom Tabs：首页 / AI / 订单 / 商品 / 我的
 * AI 为第二个核心 Tab（与首页并列），承载「手机里的电商 AI 员工」。
 *
 * 视觉：统一设计系统的激活态下划线 + 更大点击区 + 底部安全区。
 * 图标将在后续阶段以 assets.wan-wan.top 的正式资源接入，当前保持文本标签以确保零额外依赖。
 */
import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 52 }}>
      <Text
        style={{
          fontSize: 12,
          color: focused ? colors.primary : colors.textTertiary,
          fontWeight: focused ? '600' : '500',
        }}
      >
        {label}
      </Text>
      <View
        style={{
          marginTop: 4,
          height: 2,
          width: focused ? 18 : 0,
          borderRadius: 2,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarItemStyle: { height: 52 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: '首页', tabBarLabel: ({ focused }) => <TabLabel label="首页" focused={focused} /> }}
      />
      <Tabs.Screen
        name="agent"
        options={{ title: 'AI', tabBarLabel: ({ focused }) => <TabLabel label="AI" focused={focused} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: '订单', tabBarLabel: ({ focused }) => <TabLabel label="订单" focused={focused} /> }}
      />
      <Tabs.Screen
        name="products"
        options={{ title: '商品', tabBarLabel: ({ focused }) => <TabLabel label="商品" focused={focused} /> }}
      />
      <Tabs.Screen
        name="me"
        options={{ title: '我的', tabBarLabel: ({ focused }) => <TabLabel label="我的" focused={focused} /> }}
      />
    </Tabs>
  );
}
