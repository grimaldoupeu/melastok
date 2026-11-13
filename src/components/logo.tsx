import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, FontSize } from '@/constants/theme';

export function Logo({ size = 72, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <View style={styles.wrap}>
      <Image source={require('@/assets/images/logo.png')} style={{ width: size, height: size, borderRadius: size * 0.22 }} />
      {showName ? (
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.name}>MelaStock</Text>
          <Text style={styles.tagline}>Muebles de melamina · Ventas e inventario</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  name: { fontSize: FontSize.display, fontWeight: '900', color: Colors.primary, letterSpacing: -0.5 },
  tagline: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
});
