import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { Card, Chip, EmptyState, Header, IconButton, LoadingView, Row, Screen, SectionTitle, StatCard } from '@/components/ui';
import { Colors, FontSize, PaymentColors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAsync } from '@/hooks/use-async';
import { useRealtime } from '@/hooks/use-realtime';
import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  formatISODate,
  limaParts,
  limaStartOfISO,
  monthYearISO,
  rangoDiasISO,
  shortDayLabel,
  soles,
  solesCompact,
  startOfMonthISO,
  startOfWeekISO,
  toISODate,
  variacion,
} from '@/lib/format';
import { fechaEntregado, listarPedidosEntregadosDesde } from '@/services/pedidos';
import { observarResumenes, sumarResumenes } from '@/services/resumen';
import { listarVentasEntre } from '@/services/ventas';
import { PAYMENT_METHODS, type ResumenDiario } from '@/types/db';

type Periodo = 'dia' | 'semana' | 'mes';
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mes' },
];

const COLOR_VENTAS = Colors.primary;
const COLOR_PEDIDOS = Colors.accent;

type Rango = { desde: string; hasta: string; antDesde: string; antHasta: string; etiqueta: string; etiquetaAnterior: string };

function calcularRango(periodo: Periodo, ancla: string): Rango {
  if (periodo === 'dia') {
    return { desde: ancla, hasta: ancla, antDesde: addDaysISO(ancla, -1), antHasta: addDaysISO(ancla, -1), etiqueta: formatISODate(ancla, true), etiquetaAnterior: 'el día anterior' };
  }
  if (periodo === 'semana') {
    const desde = startOfWeekISO(ancla);
    const hasta = addDaysISO(desde, 6);
    return {
      desde,
      hasta,
      antDesde: addDaysISO(desde, -7),
      antHasta: addDaysISO(desde, -1),
      etiqueta: `${formatISODate(desde)} – ${formatISODate(hasta, true)}`,
      etiquetaAnterior: 'la semana anterior',
    };
  }
  const desde = startOfMonthISO(ancla);
  const antDesde = addMonthsISO(desde, -1);
  return { desde, hasta: endOfMonthISO(desde), antDesde, antHasta: endOfMonthISO(antDesde), etiqueta: monthYearISO(desde), etiquetaAnterior: 'el mes anterior' };
}

function moverAncla(periodo: Periodo, ancla: string, paso: number): string {
  if (periodo === 'dia') return addDaysISO(ancla, paso);
  if (periodo === 'semana') return addDaysISO(ancla, paso * 7);
  return addMonthsISO(ancla, paso);
}

function Variacion({ actual, anterior, contra }: { actual: number; anterior: number; contra: string }) {
  const v = variacion(actual, anterior);
  if (v === null) return <Text style={styles.varNeutral}>{actual > 0 ? `Sin datos de ${contra}` : `Igual que ${contra}`}</Text>;
  const sube = v >= 0;
  return (
    <Row style={{ gap: 4 }}>
      <Ionicons name={sube ? 'trending-up' : 'trending-down'} size={16} color={sube ? Colors.success : Colors.danger} />
      <Text style={[styles.varText, { color: sube ? Colors.success : Colors.danger }]}>
        {sube ? '+' : ''}
        {v.toFixed(1)}% vs {contra}
      </Text>
    </Row>
  );
}

export default function ReportsScreen() {
  const { isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const hoy = toISODate(new Date());
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [ancla, setAncla] = useState(hoy);
  const r = calcularRango(periodo, ancla);
  const esActual = r.desde <= hoy && hoy <= r.hasta;

  const actuales = useRealtime<ResumenDiario[]>((onData, onError) => observarResumenes(r.desde, r.hasta, onData, onError), [r.desde, r.hasta]);
  const anteriores = useRealtime<ResumenDiario[]>((onData, onError) => observarResumenes(r.antDesde, r.antHasta, onData, onError), [r.antDesde, r.antHasta]);
  const ventas = useAsync(() => listarVentasEntre(limaStartOfISO(r.desde), limaStartOfISO(addDaysISO(r.hasta, 1))), [r.desde, r.hasta, actuales.data?.length]);
  const entregados = useAsync(() => listarPedidosEntregadosDesde(limaStartOfISO(r.desde)), [r.desde, r.hasta], isAdmin);

  const tot = sumarResumenes(actuales.data ?? []);
  const ant = sumarResumenes(anteriores.data ?? []);
  const ingresos = tot.totalVentas + tot.pagosPedidos;
  const ingresosAnt = ant.totalVentas + ant.pagosPedidos;
  const ticket = tot.numVentas ? tot.totalVentas / tot.numVentas : 0;
  const gananciaVentas = tot.totalVentas - tot.costoVentas;
  const margen = tot.totalVentas ? (gananciaVentas / tot.totalVentas) * 100 : 0;

  // Gráfico: por hora (día) o por día (semana / mes), ventas + pagos de pedidos apilados
  const chart = useMemo(() => {
    if (periodo === 'dia') {
      const horas = Array.from({ length: 24 }, () => 0);
      for (const v of ventas.data ?? []) if (v.estadoEntrega !== 'cancelado' && v.fecha) horas[limaParts(v.fecha).hours] += v.total;
      const desde = Math.min(8, ...horas.map((h, i) => (h > 0 ? i : 24)));
      const hasta = Math.max(20, ...horas.map((h, i) => (h > 0 ? i : 0)));
      return horas.slice(desde, hasta + 1).map((valor, i) => ({
        stacks: [{ value: valor, color: COLOR_VENTAS }],
        label: (desde + i) % 2 === 0 ? `${desde + i}h` : '',
      }));
    }
    const porDia = new Map((actuales.data ?? []).map((d) => [d.dia, d]));
    const dias = rangoDiasISO(r.desde, r.hasta);
    const cada = dias.length > 10 ? Math.ceil(dias.length / 6) : 1;
    return dias.map((d, i) => {
      const x = porDia.get(d);
      return {
        stacks: [
          { value: x?.totalVentas ?? 0, color: COLOR_VENTAS },
          { value: x?.pagosPedidos ?? 0, color: COLOR_PEDIDOS, marginBottom: 1 },
        ],
        label: periodo === 'semana' ? ['L', 'M', 'M', 'J', 'V', 'S', 'D'][i] : i % cada === 0 ? shortDayLabel(d) : '',
      };
    });
  }, [periodo, ventas.data, actuales.data, r.desde, r.hasta]);
  const maxChart = Math.max(1, ...chart.map((c) => c.stacks.reduce((n, s) => n + s.value, 0)));

  // Productos y vendedores (desde las ventas del periodo)
  const detalle = useMemo(() => {
    const validas = (ventas.data ?? []).filter((v) => v.estadoEntrega !== 'cancelado');
    const prod = new Map<string, { nombre: string; unidades: number; total: number }>();
    const vend = new Map<string, { nombre: string; total: number; ventas: number }>();
    for (const v of validas) {
      for (const it of v.items) {
        const p = prod.get(it.productoId) ?? { nombre: it.nombre, unidades: 0, total: 0 };
        p.unidades += it.cantidad;
        p.total += it.total;
        prod.set(it.productoId, p);
      }
      const s = vend.get(v.vendedorId) ?? { nombre: v.vendedorNombre, total: 0, ventas: 0 };
      s.total += v.total;
      s.ventas += 1;
      vend.set(v.vendedorId, s);
    }
    const top = [...prod.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    return { top, maxTop: top[0]?.total ?? 1, vendedores: [...vend.values()].sort((a, b) => b.total - a.total) };
  }, [ventas.data]);

  // Pedidos a medida entregados en el periodo (solo admin)
  const pedidosEntregados = useMemo(() => {
    const desde = limaStartOfISO(r.desde).getTime();
    const hasta = limaStartOfISO(addDaysISO(r.hasta, 1)).getTime();
    const lista = (entregados.data ?? []).filter((p) => {
      const f = fechaEntregado(p)?.getTime();
      return f != null && f >= desde && f < hasta;
    });
    const precio = lista.reduce((n, p) => n + p.precio, 0);
    const costo = lista.reduce((n, p) => n + p.costoMateriales, 0);
    return { cantidad: lista.length, precio, costo, ganancia: precio - costo };
  }, [entregados.data, r.desde, r.hasta]);

  const chartWidth = width - Spacing.lg * 4 - 40;
  const barWidth = Math.max(6, Math.min(26, chartWidth / Math.max(1, chart.length) - 4));
  const metodosTotales = PAYMENT_METHODS.map((m) => ({
    metodo: m,
    ventas: tot.ventasPorMetodo[m],
    pedidos: tot.pagosPedidosPorMetodo[m],
    total: tot.ventasPorMetodo[m] + tot.pagosPedidosPorMetodo[m],
  }));
  const cargando = actuales.loading || anteriores.loading;

  return (
    <Screen>
      <Header title="Reportes" subtitle="Ventas de catálogo y pedidos a medida" />
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md }}>
        <Row style={{ gap: Spacing.sm }}>
          {PERIODOS.map((p) => (
            <Chip key={p.value} label={p.label} active={periodo === p.value} onPress={() => setPeriodo(p.value)} style={{ flex: 1, justifyContent: 'center' }} />
          ))}
        </Row>
        <View style={styles.nav}>
          <IconButton icon="chevron-back" size={36} onPress={() => setAncla(moverAncla(periodo, ancla, -1))} />
          <Pressable onPress={() => setAncla(hoy)} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.navText}>{r.etiqueta}</Text>
            {!esActual ? <Text style={styles.navHint}>Tocar para volver a hoy</Text> : null}
          </Pressable>
          <IconButton icon="chevron-forward" size={36} onPress={() => setAncla(moverAncla(periodo, ancla, 1))} disabled={r.hasta >= hoy} />
        </View>
      </View>

      {cargando ? (
        <LoadingView />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Total del periodo */}
          <Card style={{ gap: 6 }}>
            <Text style={styles.cardLabel}>Ingresos del periodo</Text>
            <Text style={styles.big}>{soles(ingresos)}</Text>
            <Variacion actual={ingresos} anterior={ingresosAnt} contra={r.etiquetaAnterior} />
            <Row style={{ gap: Spacing.lg, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Row style={{ gap: 6 }}>
                  <View style={[styles.dot, { backgroundColor: COLOR_VENTAS }]} />
                  <Text style={styles.cardLabel}>Ventas de catálogo</Text>
                </Row>
                <Text style={styles.mid}>{soles(tot.totalVentas)}</Text>
                <Variacion actual={tot.totalVentas} anterior={ant.totalVentas} contra="antes" />
              </View>
              <View style={{ flex: 1 }}>
                <Row style={{ gap: 6 }}>
                  <View style={[styles.dot, { backgroundColor: COLOR_PEDIDOS }]} />
                  <Text style={styles.cardLabel}>Pagos de pedidos</Text>
                </Row>
                <Text style={styles.mid}>{soles(tot.pagosPedidos)}</Text>
                <Variacion actual={tot.pagosPedidos} anterior={ant.pagosPedidos} contra="antes" />
              </View>
            </Row>
          </Card>

          <View style={styles.row}>
            <StatCard label="Ticket promedio" value={soles(ticket)} sub={`${tot.numVentas} ventas · ${tot.unidades} und`} icon="pricetag" color={Colors.primary} />
            <StatCard
              label="Margen de ventas"
              value={tot.totalVentas ? `${margen.toFixed(1)}%` : '—'}
              sub={`Ganancia ${soles(gananciaVentas)}`}
              icon="trending-up"
              color={margen >= 0 ? Colors.success : Colors.danger}
            />
          </View>

          {/* Gráfico */}
          <SectionTitle title={periodo === 'dia' ? 'Ventas por hora' : 'Ingresos por día'} />
          <Card style={{ gap: Spacing.sm }}>
            {ingresos === 0 && (periodo !== 'dia' || !(ventas.data ?? []).length) ? (
              <EmptyState icon="bar-chart-outline" title="Sin movimientos en este periodo" />
            ) : (
              <>
                <BarChart
                  stackData={chart}
                  width={chartWidth}
                  height={180}
                  barWidth={barWidth}
                  spacing={Math.max(3, (chartWidth - barWidth * chart.length) / Math.max(1, chart.length))}
                  initialSpacing={6}
                  endSpacing={6}
                  barBorderRadius={4}
                  noOfSections={4}
                  maxValue={Math.ceil((maxChart * 1.1) / 10) * 10}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={Colors.border}
                  rulesColor={Colors.border}
                  rulesType="dashed"
                  yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                  formatYLabel={(v: string) => solesCompact(Number(v))}
                  disablePress
                />
                {periodo !== 'dia' ? (
                  <Row style={{ gap: Spacing.lg, justifyContent: 'center' }}>
                    <Row style={{ gap: 6 }}>
                      <View style={[styles.dot, { backgroundColor: COLOR_VENTAS }]} />
                      <Text style={styles.small}>Ventas</Text>
                    </Row>
                    <Row style={{ gap: 6 }}>
                      <View style={[styles.dot, { backgroundColor: COLOR_PEDIDOS }]} />
                      <Text style={styles.small}>Pagos de pedidos</Text>
                    </Row>
                  </Row>
                ) : null}
              </>
            )}
          </Card>

          {/* Métodos de pago */}
          <SectionTitle title="Ingresos por método de pago" />
          <Card style={{ gap: Spacing.md }}>
            {ingresos === 0 ? (
              <Text style={styles.small}>Sin datos</Text>
            ) : (
              <>
                <Row style={{ gap: Spacing.lg }}>
                  <PieChart
                    data={metodosTotales.filter((m) => m.total > 0).map((m) => ({ value: m.total, color: PaymentColors[m.metodo] }))}
                    donut
                    radius={56}
                    innerRadius={36}
                    innerCircleColor={Colors.card}
                    centerLabelComponent={() => <Text style={styles.pieCenter}>{solesCompact(ingresos)}</Text>}
                  />
                  <View style={{ flex: 1, gap: 6 }}>
                    {metodosTotales.map((m) => (
                      <Row key={m.metodo} style={{ gap: 6 }}>
                        <View style={[styles.dot, { backgroundColor: PaymentColors[m.metodo] }]} />
                        <Text style={styles.legend}>{m.metodo}</Text>
                        <Text style={styles.legendValue}>{soles(m.total)}</Text>
                      </Row>
                    ))}
                  </View>
                </Row>
                <View style={styles.table}>
                  <Row style={styles.tableHead}>
                    <Text style={[styles.th, { flex: 1.2 }]}>Método</Text>
                    <Text style={styles.th}>Ventas</Text>
                    <Text style={styles.th}>Pedidos</Text>
                  </Row>
                  {metodosTotales.map((m) => (
                    <Row key={m.metodo} style={styles.tableRow}>
                      <Text style={[styles.td, { flex: 1.2, fontWeight: '700' }]}>{m.metodo}</Text>
                      <Text style={styles.td}>{soles(m.ventas)}</Text>
                      <Text style={styles.td}>{soles(m.pedidos)}</Text>
                    </Row>
                  ))}
                </View>
              </>
            )}
          </Card>

          {/* Productos más vendidos */}
          <SectionTitle title="Productos más vendidos" />
          <Card style={{ gap: Spacing.md }}>
            {ventas.loading ? (
              <Text style={styles.small}>Cargando…</Text>
            ) : !detalle.top.length ? (
              <Text style={styles.small}>Sin ventas en el periodo</Text>
            ) : (
              detalle.top.map((p, i) => (
                <View key={p.nombre + i} style={{ gap: 4 }}>
                  <Row style={{ gap: Spacing.sm }}>
                    <Text style={styles.rank}>{i + 1}</Text>
                    <Text style={[styles.legend, { flex: 1 }]} numberOfLines={1}>
                      {p.nombre}
                    </Text>
                    <Text style={styles.small}>{p.unidades} und</Text>
                    <Text style={styles.legendValue}>{soles(p.total)}</Text>
                  </Row>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.max(4, Math.round((p.total / detalle.maxTop) * 100))}%` }]} />
                  </View>
                </View>
              ))
            )}
          </Card>

          {/* Vendedores */}
          <SectionTitle title="Ventas por vendedor" />
          <Card style={{ gap: Spacing.sm }}>
            {!detalle.vendedores.length ? (
              <Text style={styles.small}>Sin ventas en el periodo</Text>
            ) : (
              detalle.vendedores.map((s) => (
                <Row key={s.nombre} style={{ gap: Spacing.sm }}>
                  <Ionicons name="person-circle-outline" size={20} color={Colors.primaryLight} />
                  <Text style={[styles.legend, { flex: 1 }]}>{s.nombre}</Text>
                  <Text style={styles.small}>{s.ventas} ventas</Text>
                  <Text style={styles.legendValue}>{soles(s.total)}</Text>
                </Row>
              ))
            )}
          </Card>

          {/* Pedidos a medida entregados (admin) */}
          {isAdmin ? (
            <>
              <SectionTitle title="Pedidos a medida entregados (solo admin)" />
              <Card style={{ gap: 6 }}>
                {entregados.loading ? (
                  <Text style={styles.small}>Cargando…</Text>
                ) : !pedidosEntregados.cantidad ? (
                  <Text style={styles.small}>Ningún pedido entregado en el periodo</Text>
                ) : (
                  <>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={styles.legend}>Pedidos entregados</Text>
                      <Text style={styles.legendValue}>{pedidosEntregados.cantidad}</Text>
                    </Row>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={styles.legend}>Valor de los pedidos</Text>
                      <Text style={styles.legendValue}>{soles(pedidosEntregados.precio)}</Text>
                    </Row>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={styles.legend}>Costo de materiales</Text>
                      <Text style={[styles.legendValue, { color: Colors.danger }]}>- {soles(pedidosEntregados.costo)}</Text>
                    </Row>
                    <View style={styles.sep} />
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={[styles.legend, { fontWeight: '800' }]}>Ganancia estimada</Text>
                      <Text style={[styles.mid, { color: pedidosEntregados.ganancia >= 0 ? Colors.success : Colors.danger }]}>{soles(pedidosEntregados.ganancia)}</Text>
                    </Row>
                    <Text style={styles.small}>Precio menos materiales registrados; no incluye mano de obra.</Text>
                  </>
                )}
              </Card>
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: { flexDirection: 'row', gap: Spacing.md },
  nav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.card, borderRadius: Radius.pill, padding: 4, borderWidth: 1, borderColor: Colors.border },
  navText: { fontSize: FontSize.md, fontWeight: '800', color: Colors.text, textTransform: 'capitalize' },
  navHint: { fontSize: 10, color: Colors.textMuted },
  cardLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  big: { fontSize: FontSize.display, fontWeight: '900', color: Colors.text },
  mid: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  varText: { fontSize: FontSize.xs, fontWeight: '700' },
  varNeutral: { fontSize: FontSize.xs, color: Colors.textMuted },
  dot: { width: 10, height: 10, borderRadius: 5 },
  small: { fontSize: FontSize.xs, color: Colors.textMuted },
  pieCenter: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text },
  legend: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  legendValue: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.text, marginLeft: 'auto' },
  table: { borderTopWidth: 1, borderTopColor: Colors.border },
  tableHead: { paddingVertical: 6 },
  tableRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  th: { flex: 1, fontSize: FontSize.xs, fontWeight: '800', color: Colors.textSecondary, textAlign: 'right' },
  td: { flex: 1, fontSize: FontSize.sm, color: Colors.text, textAlign: 'right' },
  rank: { width: 18, fontSize: FontSize.sm, fontWeight: '800', color: Colors.primary },
  bar: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  sep: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
});
