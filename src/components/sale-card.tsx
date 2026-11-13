import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Radius, Shadow, Spacing, StatusColors } from '@/constants/theme';
import { formatDateTime, formatISODate, isPastISODate, isTodayISODate, soles } from '@/lib/format';
import { SALE_STATUS_LABEL, type Sale } from '@/types/db';

export function StatusBadge({ status }: { status: Sale['status'] }) {
  const c = StatusColors[status];
  return <Badge label={SALE_STATUS_LABEL[status]} bg={c.bg} fg={c.fg} />;
}

export function PaymentBadge({ method }: { method: Sale['payment_method'] }) {
  const color = PaymentColors[method] ?? Colors.primary;
  return <Badge label={method} bg={color + '22'} fg={color} />;
}

/** Fila compacta de venta (historial / últimas ventas) */
export function SaleRow({ sale, onPress }: { sale: Sale; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}>
        <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.customer} numberOfLines={1}>
          {sale.customer_name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {sale.receipt_code} · {formatDateTime(sale.created_at)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={[styles.total, sale.status === 'cancelado' && styles.cancelled]}>{soles(sale.total)}</Text>
        <PaymentBadge method={sale.payment_method} />
      </View>
    </Pressable>
  );
}

/** Tarjeta de pedido (pestaña Pedidos) */
export function OrderCard({
  sale,
  onPress,
  onAdvance,
  advanceLabel,
}: {
  sale: Sale;
  onPress?: () => void;
  onAdvance?: () => void;
  advanceLabel?: string;
}) {
  const late = sale.delivery_date && isPastISODate(sale.delivery_date) && sale.status !== 'entregado' && sale.status !== 'cancelado';
  const today = isTodayISODate(sale.delivery_date);
  const items = sale.sale_items ?? [];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.customer}>{sale.customer_name}</Text>
          <Text style={styles.meta}>{sale.receipt_code}</Text>
        </View>
        <StatusBadge status={sale.status} />
      </View>
      {items.length ? (
        <Text style={styles.items} numberOfLines={2}>
          {items.map((i) => `${i.quantity}× ${i.product_name}`).join(', ')}
        </Text>
      ) : null}
      <View style={styles.cardFoot}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={16} color={late ? Colors.danger : today ? Colors.warning : Colors.textSecondary} />
          <Text style={[styles.delivery, late && { color: Colors.danger, fontWeight: '800' }, today && { color: Colors.warning, fontWeight: '800' }]}>
            {sale.delivery_date ? formatISODate(sale.delivery_date) : 'Sin fecha'}
            {late ? ' · Atrasado' : today ? ' · Hoy' : ''}
          </Text>
        </View>
        <Text style={styles.total}>{soles(sale.total)}</Text>
      </View>
      {sale.delivery_address ? (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Ionicons name="location-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.meta} numberOfLines={1}>
            {sale.delivery_address}
          </Text>
        </View>
      ) : null}
      {onAdvance && advanceLabel ? (
        <Pressable onPress={onAdvance} style={({ pressed }) => [styles.advance, pressed && { opacity: 0.8 }]}>
          <Text style={styles.advanceText}>{advanceLabel}</Text>
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
