import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { Card, Chip, EmptyState, ErrorView, Header, LoadingView, Screen, SectionTitle, StatCard } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { limaDaysAgo, limaStartOfMonth, shortDayLabel, soles, solesCompact, toISODate } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { PAYMENT_METHODS, type Sale } from '@/types/db';

type Period = '7d' | '30d' | 'mes';
const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: 'mes', label: 'Este mes' },
];

function periodStart(p: Period): Date {
  if (p === '7d') return limaDaysAgo(6);
  if (p === '30d') return limaDaysAgo(29);
  return limaStartOfMonth();
}

type Report = { sales: Sale[]; days: string[] };

async function fetchSales(period: Period): Promise<Report> {
  const start = periodStart(period);
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*)')
    .gte('created_at', start.toISOString())
    .neq('status', 'cancelado')
    .order('created_at', { ascending: true });
  if (error) throw error;
  // Lista de días del periodo (YYYY-MM-DD en Lima) para rellenar el gráfico
  const days: string[] = [];
  const now = Date.now();
  for (let t = start.getTime(); t <= now; t += 86_400_000) days.push(toISODate(t));
  return { sales: (data ?? []) as Sale[], days };
}

export default function ReportsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [period, setPeriod] = useState<Period>('7d');
  const { data, loading, error, refreshing, refresh, refetch } = useQuery(() => fetchSales(period), [period], { realtimeTables: ['sales'] });

  const stats = useMemo(() => {
    const sales = data?.sales ?? [];
    const days = data?.days ?? [];
    const total = sales.reduce((n, s) => n + Number(s.total), 0);
    const count = sales.length;

    // Ventas por día (rellena los días sin ventas con 0)
    const byDay = new Map<string, number>(days.map((d) => [d, 0]));
    for (const s of sales) {
      const k = toISODate(s.created_at);
      byDay.set(k, (byDay.get(k) ?? 0) + Number(s.total));
    }
    const labelEvery = days.length > 10 ? Math.ceil(days.length / 6) : 1;
    const daily = days.map((d, i) => ({
      value: byDay.get(d) ?? 0,
      label: i % labelEvery === 0 || i === days.length - 1 ? shortDayLabel(d) : '',
      frontColor: byDay.get(d) ? Colors.primary : Colors.border,
    }));
    const maxDay = Math.max(0, ...daily.map((d) => d.value));

    // Por método de pago
    const byMethod = PAYMENT_METHODS.map((m) => ({
      method: m,
      value: sales.filter((s) => s.payment_method === m).reduce((n, s) => n + Number(s.total), 0),
      count: sales.filter((s) => s.payment_method === m).length,
    })).filter((x) => x.value > 0);

    // Top productos
    const prodMap = new Map<string, { name: string; units: number; revenue: number }>();
    for (const s of sales) {
      for (const it of s.sale_items ?? []) {
        const key = it.product_id ?? it.product_name;
        const cur = prodMap.get(key) ?? { name: it.product_name, units: 0, revenue: 0 };
        cur.units += it.quantity;
        cur.revenue += Number(it.total);
        prodMap.set(key, cur);
      }
    }
    const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const maxProd = topProducts[0]?.revenue ?? 1;

    // Por vendedor
    const sellerMap = new Map<string, { name: string; total: number; count: number }>();
    for (const s of sales) {
      const key = s.seller_id ?? s.seller_name ?? '—';
      const cur = sellerMap.get(key) ?? { name: s.seller_name ?? 'Sin vendedor', total: 0, count: 0 };
      cur.total += Number(s.total);
      cur.count += 1;
      sellerMap.set(key, cur);
    }
    const sellers = [...sellerMap.values()].sort((a, b) => b.total - a.total);

    const delivered = sales.filter((s) => s.status === 'entregado').length;
    const unitsSold = sales.reduce((n, s) => n + (s.sale_items ?? []).reduce((m, i) => m + i.quantity, 0), 0);

    return { total, count, avg: count ? total / count : 0, daily, maxDay, byMethod, topProducts, maxProd, sellers, delivered, unitsSold };
  }, [data]);

  const chartWidth = width - Spacing.lg * 4 - 40;
  const barWidth = Math.max(8, Math.min(26, chartWidth / Math.max(1, stats.daily.length) - 6));

  return (
    <Screen>
      <Header title="Reportes" subtitle="Resumen de ventas" />
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {PERIODS.map((p) => (
            <Chip key={p.value} label={p.label} active={period === p.value} onPress={() => setPeriod(p.value)} />
          ))}
        </ScrollView>
      </View>

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={refetch} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}>
          <View style={styles.row}>
            <StatCard label="Total vendido" value={soles(stats.total)} sub={`${stats.count} ventas`} icon="cash" color={Colors.success} />
            <StatCard label="Ticket promedio" value={soles(stats.avg)} sub={`${stats.unitsSold} unidades`} icon="pricetag" color={Colors.primary} />
          </View>

          <SectionTitle title="Ventas por día" />
          <Card>
            {stats.count === 0 ? (
              <EmptyState icon="bar-chart-outline" title="Sin ventas en este periodo" description="Las ventas que registres aparecerán aquí." />
            ) : (
              <BarChart
                data={stats.daily}
                width={chartWidth}
                height={180}
                barWidth={barWidth}
                spacing={Math.max(4, (chartWidth - barWidth * stats.daily.length) / stats.daily.length)}
                initialSpacing={6}
                endSpacing={6}
                barBorderRadius={5}
                noOfSections={4}
                maxValue={stats.maxDay > 0 ? Math.ceil(stats.maxDay / 100) * 100 * 1.1 : 100}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor={Colors.border}
                rulesColor={Colors.border}
                rulesType="dashed"
                yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                formatYLabel={(v: string) => solesCompact(Number(v))}
                isAnimated
                disablePress
              />
            )}
          </Card>

          <SectionTitle title="Métodos de pago" />
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.lg }}>
            {stats.byMethod.length === 0 ? (
              <Text style={styles.muted}>Sin datos</Text>
            ) : (
              <>
                <PieChart
                  data={stats.byMethod.map((m) => ({ value: m.value, color: PaymentColors[m.method] }))}
                  donut
                  radius={64}
                  innerRadius={42}
                  innerCircleColor={Colors.card}
                  centerLabelComponent={() => (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>Total</Text>
                      <Text style={{ fontSize: FontSize.sm, fontWeight: '800', color: Colors.text }}>{solesCompact(stats.total)}</Text>
                    </View>
                  )}
                />
                <View style={{ flex: 1, gap: 8 }}>
                  {stats.byMethod.map((m) => (
                    <View key={m.method} style={styles.legendRow}>
                      <View style={[styles.dot, { backgroundColor: PaymentColors[m.method] }]} />
                      <Text style={styles.legendLabel}>{m.method}</Text>
                      <Text style={styles.legendValue}>{soles(m.value)}</Text>
                      <Text style={styles.legendPct}>{Math.round((m.value / stats.total) * 100)}%</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </Card>

          <SectionTitle title="Productos más vendidos" />
          <Card style={{ gap: Spacing.md }}>
            {stats.topProducts.length === 0 ? (
              <Text style={styles.muted}>Sin datos</Text>
            ) : (
              stats.topProducts.map((p, i) => (
                <View key={p.name + i} style={{ gap: 4 }}>
                  <View style={styles.legendRow}>
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Text style={[styles.legendLabel, { flex: 1 }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.legendPct}>{p.units} und</Text>
                    <Text style={styles.legendValue}>{soles(p.revenue)}</Text>
                  </View>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.max(4, Math.round((p.revenue / stats.maxProd) * 100))}%` }]} />
                  </View>
                </View>
              ))
            )}
          </Card>

          <SectionTitle title="Ventas por vendedor" />
          <Card style={{ gap: Spacing.sm }}>
            {stats.sellers.length === 0 ? (
              <Text style={styles.muted}>Sin datos</Text>
            ) : (
              stats.sellers.map((s) => (
                <View key={s.name} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: Colors.primaryLight }]} />
                  <Text style={[styles.legendLabel, { flex: 1 }]}>{s.name}</Text>
                  <Text style={styles.legendPct}>{s.count} ventas</Text>
                  <Text style={styles.legendValue}>{soles(s.total)}</Text>
                </View>
              ))
            )}
          </Card>

          <SectionTitle title="Pedidos" action="Ver pedidos" onAction={() => router.push('/pedidos')} />
          <View style={styles.row}>
            <StatCard label="Entregados" value={String(stats.delivered)} icon="checkmark-done" color={Colors.success} />
            <StatCard label="En proceso" value={String(stats.count - stats.delivered)} icon="construct" color={Colors.warning} />
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: { flexDirection: 'row', gap: Spacing.md },
  muted: { color: Colors.textMuted, fontSize: FontSize.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  legendValue: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginLeft: 'auto' },
  legendPct: { fontSize: FontSize.xs, color: Colors.textMuted, minWidth: 44, textAlign: 'right' },
  rank: { width: 20, fontSize: FontSize.sm, fontWeight: '800', color: Colors.primary },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
});
