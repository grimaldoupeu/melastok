import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Divider } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { formatDateTime, qty, soles } from '@/lib/format';
import type { Movimiento } from '@/types/db';

type IconName = 'arrow-down-circle' | 'arrow-up-circle' | 'create' | 'receipt' | 'return-up-back';

export function infoMovimiento(m: Movimiento): { label: string; icon: IconName; color: string; signo: string } {
  if (m.tipo === 'ajuste') return { label: m.nota === 'Stock inicial' ? 'Stock inicial' : 'Ajuste', icon: 'create', color: Colors.info, signo: m.cantidad > 0 ? '+' : '' };
  if (m.tipo === 'entrada') {
    return m.ventaId
      ? { label: 'Anulación de venta', icon: 'return-up-back', color: Colors.warning, signo: '+' }
      : { label: 'Ingreso', icon: 'arrow-down-circle', color: Colors.success, signo: '+' };
  }
  return m.ventaId
    ? { label: 'Venta', icon: 'receipt', color: Colors.primary, signo: '-' }
    : { label: 'Consumo', icon: 'arrow-up-circle', color: Colors.danger, signo: '-' };
}

/** Lista de movimientos del kardex. `mostrarItem` muestra el nombre del producto/material. */
export function KardexList({
  movimientos,
  unidad,
  mostrarItem,
  onPressItem,
  vacio = 'Sin movimientos registrados',
}: {
  movimientos: Movimiento[];
  unidad?: string;
  mostrarItem?: boolean;
  onPressItem?: (m: Movimiento) => void;
  vacio?: string;
}) {
  if (!movimientos.length) return <Text style={styles.empty}>{vacio}</Text>;
  return (
    <View>
      {movimientos.map((m, i) => {
        const info = infoMovimiento(m);
        const cantidad = m.tipo === 'ajuste' ? `${info.signo}${qty(m.cantidad)}` : `${info.signo}${qty(m.cantidad)}`;
        const detalle = [
          formatDateTime(m.fecha),
          m.usuarioNombre,
          m.proveedorNombre,
          m.costoUnitario != null && m.tipo === 'entrada' && !m.ventaId ? `${soles(m.costoUnitario)} c/u` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View key={m.id}>
            <Pressable onPress={onPressItem ? () => onPressItem(m) : undefined} disabled={!onPressItem} style={styles.row}>
              <Ionicons name={info.icon} size={22} color={info.color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {mostrarItem ? `${m.itemNombre}` : info.label}
                </Text>
                {mostrarItem ? <Text style={styles.meta}>{info.label}</Text> : null}
                <Text style={styles.meta} numberOfLines={2}>
                  {detalle}
                </Text>
                {m.nota && m.nota !== 'Stock inicial' ? <Text style={styles.nota}>“{m.nota}”</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.cantidad, { color: info.color }]}>
                  {cantidad}
                  {unidad ? ` ${unidad}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {qty(m.stockAnterior)} → {qty(m.stockNuevo)}
                </Text>
              </View>
            </Pressable>
            {i < movimientos.length - 1 ? <Divider style={{ marginVertical: 0 }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: 10 },
  title: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  nota: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },
  cantidad: { fontSize: FontSize.md, fontWeight: '800' },
  empty: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },
});
