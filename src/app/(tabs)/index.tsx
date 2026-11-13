import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SaleRow } from '@/components/sale-card';
import { Avatar, Banner, Card, EmptyState, ErrorView, type IconName, LoadingView, Screen, SectionTitle, StatCard } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { firstName, formatLongDate, initials, limaStartOfDay, limaStartOfMonth, monthName, soles } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { ACTIVE_STATUSES, type Material, type Product, type Sale } from '@/types/db';

type Dashboard = {
  todayTotal: number;
  todayCount: number;
  monthTotal: number;
  monthCount: number;
  activeOrders: number;
  lateOrders: number;
  lowProducts: Pick<Product, 'id' | 'name' | 'stock' | 'min_stock'>[];
  lowMaterials: Pick<Material, 'id' | 'name' | 'stock' | 'min_stock' | 'unit'>[];
  recent: Sale[];
};

async function fetchDashboard(): Promise<Dashboard> {
  const dayStart = limaStartOfDay().toISOString();
  const monthStart = limaStartOfMonth().toISOString();
  const todayISO = dayStart.slice(0, 10);

  const [month, active, products, materials, recent] = await Promise.all([
    supabase.from('sales').select('id,total,created_at').gte('created_at', monthStart).neq('status', 'cancelado'),
    supabase.from('sales').select('id,delivery_date').in('status', ACTIVE_STATUSES),
    supabase.from('products').select('id,name,stock,min_stock').eq('active', true),
    supabase.from('materials').select('id,name,stock,min_stock,unit'),
    supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(5),
  ]);
  for (const r of [month, active, products, materials, recent]) if (r.error) throw r.error;

  const monthSales = (month.data ?? []) as Pick<Sale, 'id' | 'total' | 'created_at'>[];
  const todaySales = monthSales.filter((s) => s.created_at >= dayStart);
  const activeOrders = (active.data ?? []) as Pick<Sale, 'id' | 'delivery_date'>[];

  return {
    todayTotal: todaySales.reduce((n, s) => n + Number(s.total), 0),
    todayCount: todaySales.length,
    monthTotal: monthSales.reduce((n, s) => n + Number(s.total), 0),
    monthCount: monthSales.length,
    activeOrders: activeOrders.length,
    lateOrders: activeOrders.filter((o) => o.delivery_date && o.delivery_date < todayISO).length,
    lowProducts: ((products.data ?? []) as Dashboard['lowProducts']).filter((p) => p.stock <= p.min_stock),
    lowMaterials: ((materials.data ?? []) as Dashboard['lowMaterials']).filter((m) => Number(m.stock) <= Number(m.min_stock)),
    recent: (recent.data ?? []) as Sale[],
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, isAdmin } = useAuth();
  const { data, loading, error, refreshing, refresh, refetch } = useQuery(fetchDashboard, [], {
    realtimeTables: ['sales', 'products'],
  });

  const shortcuts: { label: string; icon: IconName; color: string; onPress: () => void }[] = [
    { label: 'Nueva venta', icon: 'cart', color: Colors.primary, onPress: () => router.push('/catalogo') },
    { label: 'Catálogo', icon: 'grid', color: '#B5651D', onPress: () => router.push('/catalogo') },
    { label: 'Inventario', icon: 'cube', color: Colors.info, onPress: () => router.push('/inventario') },
    { label: 'Pedidos', icon: 'clipboard', color: '#5A3E9E', onPress: () => router.push('/pedidos') },
    { label: 'Reportes', icon: 'bar-chart', color: Colors.success, onPress: () => router.push('/reportes') },
    { label: 'Historial', icon: 'time', color: Colors.warning, onPress: () => router.push('/ventas') },
  ];

  const lowCount = (data?.lowProducts.length ?? 0) + (data?.lowMaterials.length ?? 0);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hola, {firstName(profile?.full_name) || 'bienvenido'} 👋</Text>
          <Text style={styles.date}>{formatLongDate()} · {isAdmin ? 'Administrador' : 'Vendedor'}</Text>
        </View>
        <Avatar text={initials(profile?.full_name)} size={44} onPress={() => router.push('/perfil')} />
      </View>

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={refetch} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}>
          <View style={styles.statsRow}>
            <StatCard
              label="Ventas de hoy"
              value={soles(data.todayTotal)}
              sub={`${data.todayCount} ${data.todayCount === 1 ? 'venta' : 'ventas'}`}
              icon="today"
              color={Colors.primary}
              onPress={() => router.push('/ventas')}
            />
            <StatCard
              label={`Ventas de ${monthName()}`}
              value={soles(data.monthTotal)}
              sub={`${data.monthCount} ${data.monthCount === 1 ? 'venta' : 'ventas'}`}
              icon="calendar"
              color={Colors.success}
              onPress={() => router.push('/reportes')}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Pedidos activos"
              value={String(data.activeOrders)}
              sub={data.lateOrders ? `${data.lateOrders} atrasado${data.lateOrders === 1 ? '' : 's'}` : 'Al día'}
              icon="clipboard"
              color={data.lateOrders ? Colors.danger : '#5A3E9E'}
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
              {data.lowProducts.slice(0, 2).map((p) => (
                <Banner
                  key={p.id}
                  tone={p.stock === 0 ? 'danger' : 'warning'}
                  icon="cube-outline"
                  text={p.stock === 0 ? `${p.name} está agotado` : `${p.name}: quedan ${p.stock} (mín. ${p.min_stock})`}
                  action="Ver"
                  onPress={() => router.push('/inventario')}
                />
              ))}
              {data.lowMaterials.slice(0, 2).map((m) => (
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
            {data.recent.length === 0 ? (
              <EmptyState icon="receipt-outline" title="Aún no hay ventas" description="Registra tu primera venta desde el catálogo." action="Ir al catálogo" onAction={() => router.push('/catalogo')} />
            ) : (
              data.recent.map((s) => (
                <SaleRow key={s.id} sale={s} onPress={() => router.push({ pathname: '/venta/[id]', params: { id: s.id } })} />
              ))
            )}
          </Card>
        </ScrollView>
      ) : null}
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
