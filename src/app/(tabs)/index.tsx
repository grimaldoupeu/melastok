import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SaleRow } from '@/components/sale-card';
import { Avatar, Banner, Card, EmptyState, type IconName, LoadingView, Screen, SectionTitle, StatCard } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { useRealtime } from '@/hooks/use-realtime';
import { firstName, formatLongDate, initials, isPastISODate, limaStartOfMonth, monthName, soles, toISODate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { observarProductosActivos } from '@/services/productos';
import { observarEntregas, observarVentasDesde } from '@/services/ventas';
import type { Material, Venta } from '@/types/db';

// Materiales: todavía en Supabase (se migran en la fase 4)
async function fetchLowMaterials() {
  const { data, error } = await supabase.from('materials').select('id,name,stock,min_stock,unit');
  if (error) throw error;
  return ((data ?? []) as Pick<Material, 'id' | 'name' | 'stock' | 'min_stock' | 'unit'>[]).filter((m) => Number(m.stock) <= Number(m.min_stock));
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, isAdmin } = useAuth();

  // Tiempo real (Firestore). En la fase 6 los totales pasan a resumen_diario.
  const ventasMes = useRealtime<Venta[]>((onData, onError) => observarVentasDesde(limaStartOfMonth(), onData, onError, 1000), [monthName()]);
  const entregas = useRealtime<Venta[]>((onData, onError) => observarEntregas('activos', onData, onError));
  const productos = useRealtime(observarProductosActivos);
  const materiales = useQuery(fetchLowMaterials, []);

  const stats = useMemo(() => {
    const hoy = toISODate(new Date());
    const validas = (ventasMes.data ?? []).filter((v) => v.estadoEntrega !== 'cancelado');
    const deHoy = validas.filter((v) => v.dia === hoy);
    return {
      todayTotal: deHoy.reduce((n, v) => n + v.total, 0),
      todayCount: deHoy.length,
      monthTotal: validas.reduce((n, v) => n + v.total, 0),
      monthCount: validas.length,
      recent: (ventasMes.data ?? []).slice(0, 5),
    };
  }, [ventasMes.data]);

  const lowProducts = (productos.data ?? []).filter((p) => p.stock <= p.stockMinimo);
  const lowMaterials = materiales.data ?? [];
  const lowCount = lowProducts.length + lowMaterials.length;
  const activeOrders = entregas.data?.length ?? 0;
  const lateOrders = (entregas.data ?? []).filter((v) => isPastISODate(v.fechaEntrega)).length;

  const shortcuts: { label: string; icon: IconName; color: string; onPress: () => void }[] = [
    { label: 'Nueva venta', icon: 'cart', color: Colors.primary, onPress: () => router.push('/catalogo') },
    { label: 'Catálogo', icon: 'grid', color: '#B5651D', onPress: () => router.push('/catalogo') },
    { label: 'Inventario', icon: 'cube', color: Colors.info, onPress: () => router.push('/inventario') },
    { label: 'Pedidos', icon: 'clipboard', color: '#5A3E9E', onPress: () => router.push('/pedidos') },
    { label: 'Reportes', icon: 'bar-chart', color: Colors.success, onPress: () => router.push('/reportes') },
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

      {ventasMes.loading ? (
        <LoadingView />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {ventasMes.error ? <Banner tone="danger" icon="cloud-offline-outline" text={ventasMes.error} /> : null}
          <View style={styles.statsRow}>
            <StatCard
              label="Ventas de hoy"
              value={soles(stats.todayTotal)}
              sub={`${stats.todayCount} ${stats.todayCount === 1 ? 'venta' : 'ventas'}`}
              icon="today"
              color={Colors.primary}
              onPress={() => router.push('/ventas')}
            />
            <StatCard
              label={`Ventas de ${monthName()}`}
              value={soles(stats.monthTotal)}
              sub={`${stats.monthCount} ${stats.monthCount === 1 ? 'venta' : 'ventas'}`}
              icon="calendar"
              color={Colors.success}
              onPress={() => router.push('/reportes')}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Entregas activas"
              value={String(activeOrders)}
              sub={lateOrders ? `${lateOrders} atrasada${lateOrders === 1 ? '' : 's'}` : 'Al día'}
              icon="clipboard"
              color={lateOrders ? Colors.danger : '#5A3E9E'}
              onPress={() => router.push('/pedidos')}
            />
            <StatCard
              label="Stock bajo"
              value={String(lowCount)}
              sub={lowCount ? 'ítems por reponer' : 'Todo en orden'}
              icon="warning"
              color={lowCount ? Colors.warning : Colors.success}
              onPress={() => router.push('/inventario')}
            />
          </View>

          {lowCount > 0 ? (
            <View style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
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
                  tone={Number(m.stock) === 0 ? 'danger' : 'warning'}
                  icon="layers-outline"
                  text={`${m.name}: ${m.stock} ${m.unit} (mín. ${m.min_stock})`}
                  action="Ver"
                  onPress={() => router.push({ pathname: '/material/[id]', params: { id: m.id } })}
                />
              ))}
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
            {stats.recent.length === 0 ? (
              <EmptyState
                icon="receipt-outline"
                title="Aún no hay ventas este mes"
                description="Registra una venta desde el catálogo."
                action="Ir al catálogo"
                onAction={() => router.push('/catalogo')}
              />
            ) : (
              stats.recent.map((v) => <SaleRow key={v.id} venta={v} onPress={() => router.push({ pathname: '/venta/[id]', params: { id: v.id } })} />)
            )}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.md },
  greeting: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text },
  date: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  content: { padding: Spacing.lg, paddingTop: 0, paddingBottom: Spacing.xxl, gap: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
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
  shortcutLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
});
