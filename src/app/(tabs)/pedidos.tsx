import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { OrderCard } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Chip, EmptyState, ErrorView, Header, LoadingView, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { isPastISODate } from '@/lib/format';
import { cambiarEstadoEntrega, ESTADOS_ACTIVOS, observarEntregas, SIGUIENTE_ESTADO, type FiltroEntregas } from '@/services/ventas';
import { SALE_STATUS_LABEL, type Venta } from '@/types/db';

const FILTERS: { value: FiltroEntregas; label: string }[] = [
  { value: 'activos', label: 'Activos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_produccion', label: 'En producción' },
  { value: 'listo', label: 'Listos' },
  { value: 'entregado', label: 'Entregados' },
  { value: 'cancelado', label: 'Cancelados' },
];

/**
 * Entregas programadas de ventas del catálogo (ventas con fecha de entrega).
 * Los pedidos a medida se agregan como segundo segmento en la fase 5.
 */
export default function OrdersScreen() {
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

  const filtroLabel = FILTERS.find((f) => f.value === filter)?.label.toLowerCase();

  return (
    <Screen>
      <Header
        title="Pedidos"
        subtitle={data ? `${data.length} ${filtroLabel}${late ? ` · ${late} atrasado${late === 1 ? '' : 's'}` : ''}` : 'Entregas programadas'}
      />
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>
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
              icon="clipboard-outline"
              title={filter === 'activos' ? 'No hay entregas pendientes' : 'Sin pedidos'}
              description={filter === 'activos' ? 'Las ventas con fecha de entrega aparecerán aquí.' : 'No hay pedidos con este estado.'}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.md, paddingBottom: Spacing.xxl },
});
