import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { pedidoAtrasado } from '@/components/pedido-card';
import { SaleRow } from '@/components/sale-card';
import { Avatar, Banner, Card, EmptyState, type IconName, Screen, SectionTitle, StatCard } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { endOfMonthISO, firstName, formatLongDate, initials, monthName, qty, soles, startOfMonthISO, toISODate } from '@/lib/format';
import { observarMateriales } from '@/services/materiales';
import { observarPedidosAbiertos } from '@/services/pedidos';
import { observarProductosActivos } from '@/services/productos';
import { observarResumen, observarResumenes, sumarResumenes } from '@/services/resumen';
import { observarUltimasVentas } from '@/services/ventas';
import type { Pedido, ResumenDiario, Venta } from '@/types/db';

export default function HomeScreen() {
  const router = useRouter();
  const { profile, isAdmin } = useAuth();
  const hoy = toISODate(new Date());
  const inicioMes = startOfMonthISO(hoy);
  const finMes = endOfMonthISO(hoy);

  // Todo en tiempo real desde Firestore. Los totales salen de resumen_diario.
  const resumenHoy = useRealtime<ResumenDiario>((onData, onError) => observarResumen(hoy, onData, onError), [hoy]);
  const resumenesMes = useRealtime<ResumenDiario[]>((onData, onError) => observarResumenes(inicioMes, finMes, onData, onError), [inicioMes]);
  const pedidos = useRealtime<Pedido[]>((onData, onError) => observarPedidosAbiertos(onData, onError));
  const ultimas = useRealtime<Venta[]>((onData, onError) => observarUltimasVentas(5, onData, onError));
  const productos = useRealtime(observarProductosActivos);
  const materiales = useRealtime(observarMateriales);

  const dia = resumenHoy.data;
  const mes = sumarResumenes(resumenesMes.data ?? []);
  const pedidosActivos = pedidos.data ?? [];
  const atrasados = pedidosActivos.filter(pedidoAtrasado);
  const porCobrar = pedidosActivos.reduce((n, p) => n + p.saldo, 0);
  const lowProducts = (productos.data ?? []).filter((p) => p.stock <= p.stockMinimo);
  const lowMaterials = (materiales.data ?? []).filter((m) => m.stock <= m.stockMinimo);
  const lowCount = lowProducts.length + lowMaterials.length;
  const error = resumenHoy.error ?? resumenesMes.error;

  const shortcuts: { label: string; icon: IconName; color: string; onPress: () => void }[] = [
    { label: 'Nueva venta', icon: 'cart', color: Colors.primary, onPress: () => router.push('/catalogo') },
    { label: 'Pedido a medida', icon: 'construct', color: '#5A3E9E', onPress: () => router.push({ pathname: '/pedido/[id]', params: { id: 'nuevo' } }) },
    { label: 'Inventario', icon: 'cube', color: Colors.info, onPress: () => router.push('/inventario') },
    { label: 'Cierre de caja', icon: 'wallet', color: Colors.success, onPress: () => router.push('/caja') },
    { label: 'Reportes', icon: 'bar-chart', color: '#B5651D', onPress: () => router.push('/reportes') },
    { label: 'Historial', icon: 'time', color: Colors.warning, onPress: () => router.push('/ventas') },
  ];

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hola, {firstName(profile?.nombre) || 'bienvenido'} 👋</Text>
          <Text style={styles.date}>
            {formatLongDate()} · {isAdmin ? 'Administrador' : 'Vendedor'}
          </Text>
        </View>
        <Avatar text={initials(profile?.nombre)} size={44} onPress={() => router.push('/perfil')} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Banner tone="danger" icon="cloud-offline-outline" text={error} /> : null}

        <View style={styles.statsRow}>
          <StatCard
            label="Ventas de hoy"
            value={dia ? soles(dia.totalVentas) : '…'}
            sub={dia ? `${dia.numVentas} ${dia.numVentas === 1 ? 'venta' : 'ventas'}` : undefined}
            icon="today"
            color={Colors.primary}
            onPress={() => router.push('/caja')}
          />
          <StatCard
            label={`Ventas de ${monthName()}`}
            value={resumenesMes.data ? soles(mes.totalVentas) : '…'}
            sub={resumenesMes.data ? `${mes.numVentas} ${mes.numVentas === 1 ? 'venta' : 'ventas'}` : undefined}
            icon="calendar"
            color={Colors.success}
            onPress={() => router.push('/reportes')}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            label="Pagos de pedidos hoy"
            value={dia ? soles(dia.pagosPedidos) : '…'}
            sub={resumenesMes.data ? `${soles(mes.pagosPedidos)} en el mes` : undefined}
            icon="cash"
            color="#5A3E9E"
            onPress={() => router.push('/caja')}
          />
          <StatCard
            label="Pedidos a medida"
            value={pedidos.data ? String(pedidosActivos.length) : '…'}
            sub={atrasados.length ? `${atrasados.length} atrasado${atrasados.length === 1 ? '' : 's'}` : porCobrar > 0 ? `Por cobrar ${soles(porCobrar, 0)}` : 'Al día'}
            icon="construct"
            color={atrasados.length ? Colors.danger : Colors.info}
            onPress={() => router.push('/pedidos')}
          />
        </View>

        {atrasados.length ? (
          <View style={{ gap: Spacing.sm }}>
            {atrasados.slice(0, 2).map((p) => (
              <Banner
                key={p.id}
                tone="danger"
                icon="alarm-outline"
                text={`${p.codigo} de ${p.clienteNombre} está atrasado`}
                action="Ver"
                onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: p.id } })}
              />
            ))}
          </View>
        ) : null}

        {lowCount > 0 ? (
          <View style={{ gap: Spacing.sm }}>
            {lowProducts.slice(0, 2).map((p) => (
              <Banner
                key={p.id}
                tone={p.stock === 0 ? 'danger' : 'warning'}
                icon="cube-outline"
                text={p.stock === 0 ? `${p.nombre} está agotado` : `${p.nombre}: quedan ${p.stock} (mín. ${p.stockMinimo})`}
                action="Ver"
                onPress={() => router.push({ pathname: '/producto/[id]', params: { id: p.id } })}
              />
            ))}
            {lowMaterials.slice(0, 2).map((m) => (
              <Banner
                key={m.id}
                tone={m.stock <= 0 ? 'danger' : 'warning'}
                icon="layers-outline"
                text={`${m.nombre}: ${qty(m.stock)} ${m.unidad} (mín. ${qty(m.stockMinimo)})`}
                action="Ver"
                onPress={() => router.push({ pathname: '/material/[id]', params: { id: m.id } })}
              />
            ))}
            {lowCount > 4 ? (
              <Pressable onPress={() => router.push('/inventario')}>
                <Text style={styles.more}>Ver los {lowCount} ítems con stock bajo →</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <SectionTitle title="Accesos rápidos" />
        <View style={styles.grid}>
          {shortcuts.map((s) => (
            <Pressable key={s.label} onPress={s.onPress} style={({ pressed }) => [styles.shortcut, pressed && { opacity: 0.8 }]}>
              <View style={[styles.shortcutIcon, { backgroundColor: s.color + '1F' }]}>
                <Ionicons name={s.icon} size={22} color={s.color} />
              </View>
              <Text style={styles.shortcutLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <SectionTitle title="Últimas ventas" action="Ver todas" onAction={() => router.push('/ventas')} />
        <Card style={{ paddingVertical: 4 }}>
          {ultimas.data && ultimas.data.length === 0 ? (
            <EmptyState icon="receipt-outline" title="Aún no hay ventas" description="Registra una venta desde el catálogo." action="Ir al catálogo" onAction={() => router.push('/catalogo')} />
          ) : (
            (ultimas.data ?? []).map((v) => <SaleRow key={v.id} venta={v} onPress={() => router.push({ pathname: '/venta/[id]', params: { id: v.id } })} />)
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.md },
  greeting: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text },
  date: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  content: { padding: Spacing.lg, paddingTop: 0, paddingBottom: Spacing.xxl, gap: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  more: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primary, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  shortcut: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 8,
    ...Shadow.card,
  },
  shortcutIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, textAlign: 'center' },
});
