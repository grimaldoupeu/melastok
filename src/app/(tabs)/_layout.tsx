import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { type ColorValue, Platform } from 'react-native';

import { Colors, FontSize } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function TabIcon({ active, inactive, color, focused }: { active: IconName; inactive: IconName; color: ColorValue; focused: boolean }) {
  return <Ionicons name={focused ? active : inactive} size={23} color={color as string} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabInactive,
        tabBarStyle: {
          backgroundColor: Colors.card,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'android' ? 68 : 84,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '700' },
        sceneStyle: { backgroundColor: Colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Inicio', tabBarIcon: (p) => <TabIcon active="home" inactive="home-outline" {...p} /> }}
      />
      <Tabs.Screen
        name="catalogo"
        options={{ title: 'Catálogo', tabBarIcon: (p) => <TabIcon active="grid" inactive="grid-outline" {...p} /> }}
      />
      <Tabs.Screen
        name="inventario"
        options={{ title: 'Inventario', tabBarIcon: (p) => <TabIcon active="cube" inactive="cube-outline" {...p} /> }}
      />
      <Tabs.Screen
        name="pedidos"
        options={{ title: 'Pedidos', tabBarIcon: (p) => <TabIcon active="clipboard" inactive="clipboard-outline" {...p} /> }}
      />
      <Tabs.Screen
        name="reportes"
        options={{ title: 'Reportes', tabBarIcon: (p) => <TabIcon active="bar-chart" inactive="bar-chart-outline" {...p} /> }}
      />
    </Tabs>
  );
}
