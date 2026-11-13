import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { PaymentBadge } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, Divider, EmptyState, Header, IconButton, LoadingView, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { addDaysISO, formatISODate, formatTime, soles, toISODate } from '@/lib/format';
import { observarPedidosConPagosEn } from '@/services/pedidos';
import { observarVentasDelDia } from '@/services/ventas';
import { PAYMENT_METHODS, type MetodoPago, type Pedido, type Venta } from '@/types/db';

const BUSINESS_NAME = process.env.EXPO_PUBLIC_BUSINESS_NAME || 'Muebles de Melamina';

type Operacion = {
  key: string;
  tipo: 'venta' | 'pago';
  refId: string;
  codigo: string;
  cliente: string;
  metodo: MetodoPago;
  monto: number;
  hora: Date | null;
  usuarioId: string;
  usuarioNombre: string;
  anulada: boolean;
  detalle: string;
};

function operacionesDelDia(dia: string, ventas: Venta[], pedidos: Pedido[]): Operacion[] {
  const ops: Operacion[] = [];
  for (const v of ventas) {
    ops.push({
      key: `v-${v.id}`,
      tipo: 'venta',
      refId: v.id,
      codigo: v.codigoBoleta,
      cliente: v.clienteNombre,
      metodo: v.metodoPago,
      monto: v.total,
      hora: v.fecha,
      usuarioId: v.vendedorId,
      usuarioNombre: v.vendedorNombre,
      anulada: v.estadoEntrega === 'cancelado',
      detalle: v.items.map((i) => `${i.cantidad}× ${i.nombre}`).join(', '),
    });
  }
  for (const p of pedidos) {
    p.pagos.forEach((pago, i) => {
      if (pago.dia !== dia) return;
      ops.push({
        key: `p-${p.id}-${i}`,
        tipo: 'pago',
        refId: p.id,
        codigo: p.codigo,
        cliente: p.clienteNombre,
        metodo: pago.metodo,
        monto: pago.monto,
        hora: pago.fecha,
        usuarioId: pago.usuarioId,
        usuarioNombre: pago.usuarioNombre,
        anulada: false,
        detalle: i === 0 && pago.nota === 'Adelanto' ? 'Adelanto de pedido a medida' : pago.nota || 'Pago de pedido a medida',
      });
    });
  }
  return ops.sort((a, b) => (b.hora?.getTime() ?? 0) - (a.hora?.getTime() ?? 0));
}

function totales(ops: Operacion[]) {
  const validas = ops.filter((o) => !o.anulada);
  const porMetodo = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<MetodoPago, number>;
  let ventas = 0;
  let pagos = 0;
  for (const o of validas) {
    porMetodo[o.metodo] += o.monto;
    if (o.tipo === 'venta') ventas += o.monto;
    else pagos += o.monto;
  }
  return {
    porMetodo,
    ventas,
    pagos,
    total: ventas + pagos,
    operaciones: validas.length,
    numVentas: validas.filter((o) => o.tipo === 'venta').length,
    numPagos: validas.filter((o) => o.tipo === 'pago').length,
    anuladas: ops.length - validas.length,
  };
}

function textoCierre(dia: string, quien: string, t: ReturnType<typeof totales>, ops: Operacion[]): string {
  const l: string[] = [];
  l.push(`🪵 *${BUSINESS_NAME}*`);
  l.push(`*CIERRE DE CAJA — ${formatISODate(dia, true)}*`);
  l.push(quien);
  l.push('');
  for (const m of PAYMENT_METHODS) l.push(`${m}: ${soles(t.porMetodo[m])}`);
  l.push(`*TOTAL: ${soles(t.total)}*`);
  l.push('');
  l.push(`Ventas de catálogo: ${soles(t.ventas)} (${t.numVentas})`);
  l.push(`Pagos de pedidos: ${soles(t.pagos)} (${t.numPagos})`);
  l.push(`Operaciones: ${t.operaciones}${t.anuladas ? ` · ${t.anuladas} anulada${t.anuladas === 1 ? '' : 's'}` : ''}`);
  if (ops.length) {
    l.push('');
    l.push('*DETALLE*');
    for (const o of [...ops].reverse()) {
      l.push(`${o.hora ? formatTime(o.hora) : '--'} · ${o.codigo} · ${o.metodo} · ${soles(o.monto)}${o.anulada ? ' (ANULADA)' : ''}`);
    }
  }
  return l.join('\n');
}

export default function CajaScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user, profile } = useAuth();
  const hoy = toISODate(new Date());
  const [dia, setDia] = useState(hoy);
  const [usuario, setUsuario] = useState<string | null>(null);

  const ventas = useRealtime<Venta[]>((onData, onError) => observarVentasDelDia(dia, onData, onError), [dia]);
  const pedidos = useRealtime<Pedido[]>((onData, onError) => observarPedidosConPagosEn(dia, onData, onError), [dia]);

  const todas = useMemo(() => operacionesDelDia(dia, ventas.data ?? [], pedidos.data ?? []), [dia, ventas.data, pedidos.data]);
  // El vendedor ve solo lo que él registró; el admin ve todo y puede filtrar por usuario
  const filtroUsuario = isAdmin ? usuario : (user?.uid ?? '__ninguno__');
  const ops = filtroUsuario ? todas.filter((o) => o.usuarioId === filtroUsuario) : todas;
  const t = totales(ops);
  const usuarios = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of todas) m.set(o.usuarioId, o.usuarioNombre);
    return [...m.entries()];
  }, [todas]);

  const compartir = async () => {
    const quien = isAdmin ? (usuario ? `Usuario: ${usuarios.find(([id]) => id === usuario)?.[1] ?? ''}` : 'Todos los usuarios') : `Usuario: ${profile?.nombre ?? ''}`;
    try {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(textoCierre(dia, quien, t, ops))}`);
    } catch (e) {
      toast.show(firebaseErrorMessage(e, 'No se pudo abrir WhatsApp'), 'error');
    }
  };

  const cargando = ventas.loading || pedidos.loading;
  const error = ventas.error ?? pedidos.error;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Cierre de caja" subtitle={dia === hoy ? 'Hoy' : formatISODate(dia, true)} back />
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.sm }}>
        <Row style={{ gap: Spacing.sm }}>
          <IconButton icon="chevron-back" onPress={() => setDia(addDaysISO(dia, -1))} />
          <View style={{ flex: 1 }}>
            <DateField value={dia} onChange={(v) => v && setDia(v)} allowClear={false} />
          </View>
          <IconButton icon="chevron-forward" onPress={() => setDia(addDaysISO(dia, 1))} disabled={dia >= hoy} />
        </Row>
        {isAdmin && usuarios.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            <Chip label="Todos" active={usuario === null} onPress={() => setUsuario(null)} />
            {usuarios.map(([id, nombre]) => (
              <Chip key={id} label={nombre} icon="person-outline" active={usuario === id} onPress={() => setUsuario(usuario === id ? null : id)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      {cargando ? (
        <LoadingView />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Banner tone="danger" icon="cloud-offline-outline" text={error} /> : null}
          {!isAdmin ? <Banner tone="info" icon="person-outline" text="Ves solo las ventas y pagos que registraste tú." /> : null}

          <Card style={{ gap: Spacing.sm }}>
            <Text style={styles.label}>Total en caja</Text>
            <Text style={styles.total}>{soles(t.total)}</Text>
            <Text style={styles.small}>
              {t.operaciones} operación{t.operaciones === 1 ? '' : 'es'}
              {t.anuladas ? ` · ${t.anuladas} anulada${t.anuladas === 1 ? '' : 's'} (no suman)` : ''}
            </Text>
            <Divider />
            {PAYMENT_METHODS.map((m) => (
              <Row key={m} style={{ gap: Spacing.sm, paddingVertical: 2 }}>
                <View style={[styles.dot, { backgroundColor: PaymentColors[m] }]} />
                <Text style={styles.metodo}>{m}</Text>
                <Text style={styles.metodoValor}>{soles(t.porMetodo[m])}</Text>
              </Row>
            ))}
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.small}>Ventas de catálogo ({t.numVentas})</Text>
              <Text style={styles.sub}>{soles(t.ventas)}</Text>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={styles.small}>Pagos de pedidos a medida ({t.numPagos})</Text>
              <Text style={styles.sub}>{soles(t.pagos)}</Text>
            </Row>
          </Card>

          <Button title="Compartir cierre por WhatsApp" icon="logo-whatsapp" variant="whatsapp" onPress={compartir} disabled={!ops.length} />

          <SectionTitle title="Detalle de operaciones" />
          <Card style={{ paddingVertical: Spacing.sm }}>
            {!ops.length ? (
              <EmptyState icon="wallet-outline" title="Sin operaciones" description="No hay ventas ni pagos registrados en este día." />
            ) : (
              ops.map((o, i) => (
                <View key={o.key}>
                  <Pressable
                    onPress={() =>
                      o.tipo === 'venta'
                        ? router.push({ pathname: '/venta/[id]', params: { id: o.refId } })
                        : router.push({ pathname: '/pedido/[id]', params: { id: o.refId } })
                    }
                    style={({ pressed }) => [styles.op, pressed && { opacity: 0.8 }]}>
                    <View style={[styles.opIcon, o.tipo === 'pago' && { backgroundColor: '#E6E1F7' }, o.anulada && { backgroundColor: Colors.dangerSoft }]}>
                      <Ionicons
                        name={o.anulada ? 'close-circle-outline' : o.tipo === 'venta' ? 'receipt-outline' : 'construct-outline'}
                        size={18}
                        color={o.anulada ? Colors.danger : o.tipo === 'venta' ? Colors.primary : '#5A3E9E'}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.opTitle} numberOfLines={1}>
                        {o.codigo} · {o.cliente}
                      </Text>
                      <Text style={styles.small} numberOfLines={1}>
                        {o.hora ? formatTime(o.hora) : '--'} · {o.usuarioNombre}
                        {o.anulada ? ' · ANULADA' : ''}
                      </Text>
                      <Text style={styles.small} numberOfLines={1}>
                        {o.detalle}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.opMonto, o.anulada && styles.tachado]}>{soles(o.monto)}</Text>
                      <PaymentBadge method={o.metodo} />
                    </View>
                  </Pressable>
                  {i < ops.length - 1 ? <Divider style={{ marginVertical: 0 }} /> : null}
                </View>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: Spacing.xxl },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  total: { fontSize: FontSize.display + 4, fontWeight: '900', color: Colors.text },
  small: { fontSize: FontSize.xs, color: Colors.textMuted },
  sub: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  dot: { width: 12, height: 12, borderRadius: 6 },
  metodo: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  metodoValor: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  op: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 10 },
  opIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  opTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  opMonto: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text },
  tachado: { textDecorationLine: 'line-through', color: Colors.textMuted },
});
