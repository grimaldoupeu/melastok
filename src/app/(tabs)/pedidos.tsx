import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { OrderCard } from '@/components/sale-card';
import { useToast } from '@/components/toast';
import { Chip, EmptyState, ErrorView, Header, LoadingView, Screen } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { isPastISODate } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { ACTIVE_STATUSES, NEXT_STATUS, SALE_STATUS_LABEL, type Sale, type SaleStatus } from '@/types/db';

type Filter = 'activos' | SaleStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'activos', label: 'Activos' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'en_produccion', label: 'En producción' },
  { value: 'listo', label: 'Listos' },
  { value: 'entregado', label: 'Entregados' },
  { value: 'cancelado', label: 'Cancelados' },
];

async function fetchOrders(filter: Filter): Promise<Sale[]> {
  let query = supabase.from('sales').select('*, sale_items(*)');
  if (filter === 'activos') {
    query = query.in('status', ACTIVE_STATUSES).order('delivery_date', { ascending: true, nullsFirst: false });
  } else if (filter === 'entregado' || filter === 'cancelado') {
    query = query.eq('status', filter).order('updated_at', { ascending: false }).limit(100);
  } else {
    query = query.eq('status', filter).order('delivery_date', { ascending: true, nullsFirst: false });
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Sale[];
}

export default function OrdersScreen() {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('activos');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, refreshing, refresh, refetch } = useQuery(() => fetchOrders(filter), [filter], { realtimeTables: ['sales'] });

  const late = useMemo(() => (data ?? []).filter((s) => ACTIVE_STATUSES.includes(s.status) && isPastISODate(s.delivery_date)).length, [data]);

  const advance = async (sale: Sale) => {
    const next = NEXT_STATUS[sale.status];
    if (!next) return;
    setBusy(sale.id);
    const { error: err } = await supabase.rpc('update_sale_status', { p_sale_id: sale.id, p_status: next });
    setBusy(null);
    if (err) {
      toast.show(errorMessage(err), 'error');
      return;
    }
    toast.show(`${sale.receipt_code} → ${SALE_STATUS_LABEL[next]}`, 'success');
    refetch();
  };

  return (
    <Screen>
      <Header
        title="Pedidos"
        subtitle={data ? `${data.length} ${filter === 'activos' ? 'activos' : FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}${late ? ` · ${late} atrasado${late === 1 ? '' : 's'}` : ''}` : undefined}
      />
      <View style={{ paddingHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} active={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>
      </View>

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-outline"
              title={filter === 'activos' ? 'No hay pedidos activos' : 'Sin pedidos'}
              description={filter === 'activos' ? 'Las ventas con fecha de entrega aparecerán aquí.' : 'No hay pedidos con este estado.'}
            />
          }
          renderItem={({ item }) => {
            const next = NEXT_STATUS[item.status];
            return (
              <OrderCard
                sale={item}
                onPress={() => router.push({ pathname: '/venta/[id]', params: { id: item.id } })}
                onAdvance={next ? () => advance(item) : undefined}
                advanceLabel={next ? (busy === item.id ? 'Actualizando…' : `Marcar como ${SALE_STATUS_LABEL[next].toLowerCase()}`) : undefined}
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
