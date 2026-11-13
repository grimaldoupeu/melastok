import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/toast';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootNavigator() {
  const { user, loading, isActive } = useAuth();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;
  const loggedIn = !!user;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}>
      <Stack.Protected guard={!loggedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>

      {/* Sesión iniciada pero perfil pendiente de aprobación (o sin cargar): sin acceso a pestañas */}
      <Stack.Protected guard={loggedIn && !isActive}>
        <Stack.Screen name="pendiente" />
      </Stack.Protected>

      <Stack.Protected guard={loggedIn && isActive}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="venta/nueva" options={{ presentation: 'modal' }} />
        <Stack.Screen name="venta/exito" options={{ gestureEnabled: false }} />
        <Stack.Screen name="venta/[id]" />
        <Stack.Screen name="ventas" />
        <Stack.Screen name="producto/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="material/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="perfil" options={{ presentation: 'modal' }} />
        <Stack.Screen name="usuarios" />
        <Stack.Screen name="categorias" />
        <Stack.Screen name="proveedor/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="kardex" />
        <Stack.Screen name="pedido/[id]" />
        <Stack.Screen name="caja" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ToastProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </ToastProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
