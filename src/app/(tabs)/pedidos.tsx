import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PedidoCard, pedidoAtrasado } from '@/components/pedido-card';
import { OrderCard } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Chip, EmptyState, ErrorView, Header, IconButton, LoadingView, Screen } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { isPastISODate } from '@/lib/format';
import { observarPedidos, type FiltroPedidos } from '@/services/pedidos';
import { cambiarEstadoEntrega, ESTADOS_ACTIVOS, observarEntregas, SIGUIENTE_ESTADO, type FiltroEntregas } from '@/services/ventas';
import { SALE_STATUS_LABEL, type Pedido, type Venta } from '@/types/db';

type Segmento = 'medida' | 'entregas';
type IconName = ComponentProps<typeof Ionicons>['name'];

const SEGMENTOS: { value: Segmento; label: string; icon: IconName }[] = [
  { value: 'medida', label: 'A medida', icon: 'construct' },
  { value: 'entregas', label: 'Entregas', icon: 'cube' },
];

export default function OrdersScreen() {
  const router = useRouter();
  const [segmento, setSegmento] = useState<Segmento>('medida');

  return (
    <Screen>
      <Header
        title="Pedidos"
        subtitle={segmento === 'medida' ? 'Muebles a medida en el taller' : 'Ventas con entrega programada'}
        right={
          segmento === 'medida' ? (
            <IconButton icon="add" bg={Colors.primary} color={Colors.white} onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: 'nuevo' } })} />
          ) : undefined
        }
      />
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <View style={styles.segment}>
          {SEGMENTOS.map((s) => (
            <Pressable key={s.value} onPress={() => setSegmento(s.value)} style={[styles.segmentBtn, segmento === s.value && styles.segmentActive]}>
              <Ionicons name={s.icon} size={15} color={segmento === s.value ? Colors.white : Colors.textSecondary} />
              <Text style={[styles.segmentText, segmento === s.value && { color: Colors.white }]}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {segmento === 'medida' ? <PedidosAMedida /> : <Entregas />}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Pedidos a medida                                                    */
/* ------------------------------------------------------------------ */

const FILTROS_PEDIDO: { value: FiltroPedidos; label: string }[] = [
  { value: 'proceso', label: 'En proceso' },
  { value: 'terminados', label: 'Terminados' },
  { value: 'entregados', label: 'Entregados' },
  { value: 'cancelados', label: 'Cancelados' },
];

function PedidosAMedida() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroPedidos>('proceso');
  const { data, loading, error } = useRealtime<Pedido[]>((onData, onError) => observarPedidos(filtro, onData, onError), [filtro]);
  const atrasados = useMemo(() => (data ?? []).filter(pedidoAtrasado).length, [data]);
  const porCobrar = useMemo(() => (data ?? []).filter((p) => p.etapa !== 'cancelado').reduce((n, p) => n + p.saldo, 0), [data]);

  return (
    <>
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {FILTROS_PEDIDO.map((f) => (
            <Chip key={f.value} label={f.label} active={filtro === f.value} onPress={() => setFiltro(f.value)} />
          ))}
        </ScrollView>
        {data && data.length && filtro !== 'cancelados' ? (
          <Text style={styles.resumen}>
            {data.length} pedido{data.length === 1 ? '' : 's'}
            {atrasados ? ` · ` : ''}
            {atrasados ? <Text style={{ color: Colors.danger, fontWeight: '800' }}>{`${atrasados} atrasado${atrasados === 1 ? '' : 's'}`}</Text> : null}
            {porCobrar > 0 ? ` · por cobrar S/ ${porCobrar.toFixed(2)}` : ''}
          </Text>
        ) : null}
      </View>
      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="construct-outline"
              title={filtro === 'proceso' ? 'No hay pedidos en proceso' : 'Sin pedidos'}
              description={filtro === 'proceso' ? 'Registra cocinas, roperos o muebles a medida con su adelanto.' : 'No hay pedidos con este estado.'}
              action={filtro === 'proceso' ? 'Nuevo pedido' : undefined}
              onAction={() => router.push({ pathname: '/pedido/[id]', params: { id: 'nuevo' } })}
            />
          }
          renderItem={({ item }) => <PedidoCard pedido={item} onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: item.id } })} />}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Entregas (ventas del catálogo con fecha de entrega)                 */
/* ------------------------------------------------------------------ */

const FILTROS_ENTREGA: { value: FiltroEntregas; label: string }[] = [
  { value: 'activos', label: 'Activas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_produccion', label: 'En producción' },
  { value: 'listo', label: 'Listas' },
  { value: 'entregado', label: 'Entregadas' },
  { value: 'cancelado', label: 'Anuladas' },
];

function Entregas() {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<FiltroEntregas>('activos');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error } = useRealtime<Venta[]>((onData, onError) => observarEntregas(filter, onData, onError), [filter]);
  const late = useMemo(() => (data ?? []).filter((s) => ESTADOS_ACTIVOS.includes(s.estadoEntrega) && isPastISODate(s.fechaEntrega)).length, [data]);

  const advance = async (venta: Venta) => {
    const next = SIGUIENTE_ESTADO[venta.estadoEntrega];
    if (!next || next === 'cancelado') return;
    setBusy(venta.id);
    try {
      await cambiarEstadoEntrega(venta.id, next);
      toast.show(`${venta.codigoBoleta} → ${SALE_STATUS_LABEL[next]}`, 'success');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, gap: Spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {FILTROS_ENTREGA.map((f) => (
            <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>
        {late ? <Text style={[styles.resumen, { color: Colors.danger, fontWeight: '800' }]}>{`${late} entrega${late === 1 ? '' : 's'} atrasada${late === 1 ? '' : 's'}`}</Text> : null}
      </View>
      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title={filter === 'activos' ? 'No hay entregas pendientes' : 'Sin entregas'}
              description={filter === 'activos' ? 'Las ventas con fecha de entrega aparecerán aquí.' : 'No hay entregas con este estado.'}
            />
          }
          renderItem={({ item }) => {
            const next = SIGUIENTE_ESTADO[item.estadoEntrega];
            return (
              <OrderCard
                venta={item}
                onPress={() => router.push({ pathname: '/venta/[id]', params: { id: item.id } })}
                onAdvance={next ? () => advance(item) : undefined}
                advanceLabel={next ? `Marcar como ${SALE_STATUS_LABEL[next].toLowerCase()}` : undefined}
                busy={busy === item.id}
              />
            );
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: Colors.primarySoft, borderRadius: Radius.pill, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: Radius.pill },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { fontWeight: '700', color: Colors.textSecondary, fontSize: FontSize.sm },
  resumen: { fontSize: FontSize.sm, color: Colors.textSecondary },
  list: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.md, paddingBottom: Spacing.xxl },
});
