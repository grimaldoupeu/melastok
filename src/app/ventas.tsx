import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SaleRow } from '@/components/sale-card';
import { Card, Chip, EmptyState, ErrorView, Header, LoadingView, Screen, SearchBar } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useQuery } from '@/hooks/use-query';
import { limaDaysAgo, limaStartOfDay, limaStartOfMonth, soles } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Sale } from '@/types/db';

type Range = 'hoy' | 'semana' | 'mes' | 'todo';
const RANGES: { value: Range; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: '7 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'todo', label: 'Todo' },
];

async function fetchSales(range: Range): Promise<Sale[]> {
  let q = supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(300);
  if (range === 'hoy') q = q.gte('created_at', limaStartOfDay().toISOString());
  if (range === 'semana') q = q.gte('created_at', limaDaysAgo(6).toISOString());
  if (range === 'mes') q = q.gte('created_at', limaStartOfMonth().toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Sale[];
}

export default function SalesHistoryScreen() {
  const router = useRouter();
  const [range, setRange] = useState<Range>('hoy');
  const [search, setSearch] = useState('');
  const { data, loading, error, refreshing, refresh, refetch } = useQuery(() => fetchSales(range), [range], { realtimeTables: ['sales'] });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((s) => !q || s.customer_name.toLowerCase().includes(q) || s.receipt_code.toLowerCase().includes(q) || s.customer_phone?.includes(q));
  }, [data, search]);

  const valid = filtered.filter((s) => s.status !== 'cancelado');
  const total = valid.reduce((n, s) => n + Number(s.total), 0);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Historial de ventas" back />
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Buscar por cliente, boleta o teléfono…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {RANGES.map((r) => (
            <Chip key={r.value} label={r.label} active={range === r.value} onPress={() => setRange(r.value)} />
          ))}
        </ScrollView>
        <Card style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>Ventas</Text>
            <Text style={styles.summaryValue}>{valid.length}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={[styles.summaryValue, { color: Colors.primary }]}>{soles(total)}</Text>
          </View>
        </Card>
      </View>

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title="Sin ventas" description="No hay ventas en este periodo." />}
          renderItem={({ item }) => <SaleRow sale={item} onPress={() => router.push({ pathname: '/venta/[id]', params: { id: item.id } })} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  summaryValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
});
