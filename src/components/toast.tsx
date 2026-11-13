import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';

type Tone = 'success' | 'error' | 'info';
type ToastState = { message: string; tone: Tone; id: number } | null;

const ToastContext = createContext<{ show: (message: string, tone?: Tone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, tone: Tone = 'info') => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
    return () => clearTimeout(t);
  }, [toast, opacity]);

  const value = useMemo(() => ({ show }), [show]);
  const palette: Record<Tone, { bg: string; icon: 'checkmark-circle' | 'alert-circle' | 'information-circle' }> = {
    success: { bg: Colors.success, icon: 'checkmark-circle' },
    error: { bg: Colors.danger, icon: 'alert-circle' },
    info: { bg: Colors.primaryDark, icon: 'information-circle' },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity, bottom: insets.bottom + 90, backgroundColor: palette[toast.tone].bg }]}>
          <Ionicons name={palette[toast.tone].icon} size={18} color={Colors.white} />
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: Radius.md,
    elevation: 8,
  },
  text: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm, flex: 1 },
});
