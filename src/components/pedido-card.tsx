import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { formatISODate, isPastISODate, isTodayISODate, soles } from '@/lib/format';
import { ETAPA_LABEL, ETAPAS_FLUJO, type EtapaPedido, type Pedido } from '@/types/db';

const ETAPA_COLOR: Record<EtapaPedido, { bg: string; fg: string }> = {
  cotizado: { bg: Colors.infoSoft, fg: '#2F4F80' },
  corte: { bg: Colors.warningSoft, fg: '#9A5F10' },
  enchapado: { bg: Colors.warningSoft, fg: '#9A5F10' },
  armado: { bg: Colors.warningSoft, fg: '#9A5F10' },
  entrega: { bg: '#E6E1F7', fg: '#5A3E9E' },
  entregado: { bg: Colors.successSoft, fg: '#2B6B41' },
  cancelado: { bg: Colors.dangerSoft, fg: '#9A2E26' },
};

export function EtapaBadge({ etapa }: { etapa: EtapaPedido }) {
  const c = ETAPA_COLOR[etapa];
  return <Badge label={ETAPA_LABEL[etapa]} bg={c.bg} fg={c.fg} />;
}

/** ¿El pedido está atrasado? (fecha de entrega pasada y aún no entregado ni cancelado) */
export function pedidoAtrasado(p: Pedido): boolean {
  return p.etapa !== 'entregado' && p.etapa !== 'cancelado' && isPastISODate(p.fechaEntrega);
}

/** Barra de progreso por etapas (cotizado → … → entregado) */
export function EtapaProgress({ etapa, compact }: { etapa: EtapaPedido; compact?: boolean }) {
  const actual = ETAPAS_FLUJO.indexOf(etapa);
  const cancelado = etapa === 'cancelado';
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.track}>
        {ETAPAS_FLUJO.map((e, i) => {
          const hecho = !cancelado && i <= actual;
          return (
            <View
              key={e}
              style={[
                styles.segment,
                { backgroundColor: cancelado ? Colors.dangerSoft : hecho ? (etapa === 'entregado' ? Colors.success : Colors.primary) : Colors.border },
              ]}
            />
          );
        })}
      </View>
      {!compact ? (
        <View style={styles.labels}>
          {ETAPAS_FLUJO.map((e, i) => (
            <Text key={e} style={[styles.label, !cancelado && i === actual && styles.labelActive]} numberOfLines={1}>
              {e === 'entrega' ? 'Listo' : ETAPA_LABEL[e]}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function PedidoCard({ pedido, onPress }: { pedido: Pedido; onPress?: () => void }) {
  const atrasado = pedidoAtrasado(pedido);
  const hoy = pedido.etapa !== 'entregado' && pedido.etapa !== 'cancelado' && isTodayISODate(pedido.fechaEntrega);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, atrasado && styles.cardLate, pressed && { opacity: 0.9 }]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cliente}>{pedido.clienteNombre}</Text>
          <Text style={styles.meta}>{pedido.codigo}</Text>
        </View>
        <EtapaBadge etapa={pedido.etapa} />
      </View>
      <Text style={styles.desc} numberOfLines={2}>
        {pedido.descripcion}
      </Text>
      <EtapaProgress etapa={pedido.etapa} compact />
      <View style={styles.foot}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="calendar-outline" size={16} color={atrasado ? Colors.danger : hoy ? Colors.warning : Colors.textSecondary} />
          <Text style={[styles.fecha, atrasado && { color: Colors.danger, fontWeight: '800' }, hoy && { color: Colors.warning, fontWeight: '800' }]}>
            {pedido.fechaEntrega ? formatISODate(pedido.fechaEntrega) : 'Sin fecha'}
            {atrasado ? ' · Atrasado' : hoy ? ' · Hoy' : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.total}>{soles(pedido.precio)}</Text>
          {pedido.saldo > 0 && pedido.etapa !== 'cancelado' ? (
            <Text style={styles.saldo}>Saldo {soles(pedido.saldo)}</Text>
          ) : pedido.etapa !== 'cancelado' ? (
            <Text style={[styles.saldo, { color: Colors.success }]}>Pagado</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  labels: { flexDirection: 'row', gap: 3 },
  label: { flex: 1, fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
  labelActive: { color: Colors.primary, fontWeight: '800' },
  card: { backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.sm, borderLeftWidth: 4, borderLeftColor: 'transparent', ...Shadow.card },
  cardLate: { borderLeftColor: Colors.danger, backgroundColor: '#FFF8F7' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cliente: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 19 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fecha: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  total: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  saldo: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.danger },
});
