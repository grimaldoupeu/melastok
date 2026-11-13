import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Radius, Shadow, Spacing, StatusColors } from '@/constants/theme';
import { formatDateTime, formatISODate, isPastISODate, isTodayISODate, soles } from '@/lib/format';
import { SALE_STATUS_LABEL, type EstadoEntrega, type MetodoPago, type Venta } from '@/types/db';

export function StatusBadge({ status }: { status: EstadoEntrega }) {
  const c = StatusColors[status];
  return <Badge label={SALE_STATUS_LABEL[status]} bg={c.bg} fg={c.fg} />;
}

export function PaymentBadge({ method }: { method: MetodoPago }) {
  const color = PaymentColors[method] ?? Colors.primary;
  return <Badge label={method} bg={color + '22'} fg={color} />;
}

/** Fila compacta de venta (historial / últimas ventas) */
export function SaleRow({ venta, onPress }: { venta: Venta; onPress?: () => void }) {
  const anulada = venta.estadoEntrega === 'cancelado';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={[styles.icon, anulada && { backgroundColor: Colors.dangerSoft }]}>
        <Ionicons name={anulada ? 'close-circle-outline' : 'receipt-outline'} size={18} color={anulada ? Colors.danger : Colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.customer} numberOfLines={1}>
          {venta.clienteNombre}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {venta.codigoBoleta} · {formatDateTime(venta.fecha)}
          {anulada ? ' · Anulada' : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.total, anulada && styles.cancelled]}>{soles(venta.total)}</Text>
        <PaymentBadge method={venta.metodoPago} />
      </View>
    </Pressable>
  );
}

/** Tarjeta de entrega programada (pestaña Pedidos > Entregas) */
export function OrderCard({
  venta,
  onPress,
  onAdvance,
  advanceLabel,
  busy,
}: {
  venta: Venta;
  onPress?: () => void;
  onAdvance?: () => void;
  advanceLabel?: string;
  busy?: boolean;
}) {
  const activo = venta.estadoEntrega !== 'entregado' && venta.estadoEntrega !== 'cancelado';
  const late = activo && isPastISODate(venta.fechaEntrega);
  const today = activo && isTodayISODate(venta.fechaEntrega);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customer}>{venta.clienteNombre}</Text>
          <Text style={styles.meta}>{venta.codigoBoleta}</Text>
        </View>
        <StatusBadge status={venta.estadoEntrega} />
      </View>
      {venta.items.length ? (
        <Text style={styles.items} numberOfLines={2}>
          {venta.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', ')}
        </Text>
      ) : null}
      <View style={styles.cardFoot}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={16} color={late ? Colors.danger : today ? Colors.warning : Colors.textSecondary} />
          <Text style={[styles.delivery, late && { color: Colors.danger, fontWeight: '800' }, today && { color: Colors.warning, fontWeight: '800' }]}>
            {venta.fechaEntrega ? formatISODate(venta.fechaEntrega) : 'Sin fecha'}
            {late ? ' · Atrasado' : today ? ' · Hoy' : ''}
          </Text>
        </View>
        <Text style={styles.total}>{soles(venta.total)}</Text>
      </View>
      {venta.deliveryDireccion ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.meta} numberOfLines={1}>
            {venta.deliveryDireccion}
          </Text>
        </View>
      ) : null}
      {onAdvance && advanceLabel ? (
        <Pressable onPress={onAdvance} disabled={busy} style={({ pressed }) => [styles.advance, (pressed || busy) && { opacity: 0.7 }]}>
          <Text style={styles.advanceText}>{busy ? 'Actualizando…' : advanceLabel}</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.white} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  customer: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  total: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  cancelled: { textDecorationLine: 'line-through', color: Colors.textMuted },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  items: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  delivery: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  advance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 40,
    marginTop: 4,
  },
  advanceText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.sm },
});
