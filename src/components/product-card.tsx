import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { soles } from '@/lib/format';
import type { Product } from '@/types/db';

/** Imagen de producto. `size` numérico = cuadrado fijo; 'full' = ancho completo con proporción 1:1 */
export function ProductImage({ uri, size, radius = Radius.md }: { uri: string | null; size: number | 'full'; radius?: number }) {
  const box = size === 'full' ? { width: '100%' as const, aspectRatio: 1 } : { width: size, height: size };
  if (uri) {
    return <Image source={{ uri }} style={[box, { borderRadius: radius, backgroundColor: Colors.primarySoft }]} contentFit="cover" transition={150} />;
  }
  return (
    <View style={[box, { borderRadius: radius, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="cube-outline" size={size === 'full' ? 48 : size * 0.4} color={Colors.primaryLight} />
    </View>
  );
}

export function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock <= 0) return <Badge label="Agotado" bg={Colors.dangerSoft} fg="#9A2E26" />;
  if (stock <= min) return <Badge label={`Quedan ${stock}`} bg={Colors.warningSoft} fg="#9A5F10" />;
  return <Badge label={`Stock ${stock}`} bg={Colors.successSoft} fg="#2B6B41" />;
}

/** Tarjeta de producto para el catálogo (grilla de 2 columnas) */
export function ProductCard({
  product,
  inCart,
  onAdd,
  onPress,
  onEdit,
}: {
  product: Product;
  inCart: number;
  onAdd: () => void;
  onPress?: () => void;
  onEdit?: () => void;
}) {
  const out = product.stock <= 0;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View>
        <ProductImage uri={product.image_url} size="full" radius={Radius.md} />
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} style={styles.editBtn}>
            <Ionicons name="pencil" size={14} color={Colors.primary} />
          </Pressable>
        ) : null}
        {product.categories?.name ? (
          <View style={styles.catTag}>
            <Text style={styles.catText}>{product.categories.name}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {product.name}
      </Text>
      <StockBadge stock={product.stock} min={product.min_stock} />
      <View style={styles.footer}>
        <Text style={styles.price}>{soles(product.price)}</Text>
        <Pressable
          onPress={onAdd}
          disabled={out}
          hitSlop={6}
          style={({ pressed }) => [styles.addBtn, out && { backgroundColor: Colors.border }, pressed && { opacity: 0.8 }]}>
          {inCart > 0 ? <Text style={styles.addCount}>{inCart}</Text> : <Ionicons name="add" size={20} color={Colors.white} />}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    gap: 6,
    ...Shadow.card,
  },
  editBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catTag: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(43,29,20,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  catText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  name: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, minHeight: 36, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  price: { fontSize: FontSize.md, fontWeight: '800', color: Colors.primary },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCount: { color: Colors.white, fontWeight: '800', fontSize: FontSize.sm },
});
