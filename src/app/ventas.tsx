import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SaleRow } from '@/components/sale-card';
import { Card, Chip, EmptyState, ErrorView, Header, LoadingView, Screen, SearchBar } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useRealtime } from '@/hooks/use-realtime';
import { limaDaysAgo, limaStartOfDay, limaStartOfMonth, soles } from '@/lib/format';
import { observarVentasDesde } from '@/services/ventas';
import type { Venta } from '@/types/db';

type Range = 'hoy' | 'semana' | 'mes' | 'todo';
const RANGES: { value: Range; label: string }[] = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'semana', label: '7 días' },
  { value: 'mes', label: 'Este mes' },
  { value: 'todo', label: 'Últimas 300' },
];

function desde(range: Range): Date | null {
  if (range === 'hoy') return limaStartOfDay();
  if (range === 'semana') return limaDaysAgo(6);
  if (range === 'mes') return limaStartOfMonth();
  return null;
}

export default function SalesHistoryScreen() {
  const router = useRouter();
  const [range, setRange] = useState<Range>('hoy');
  const [search, setSearch] = useState('');
  const { data, loading, error } = useRealtime<Venta[]>((onData, onError) => observarVentasDesde(desde(range), onData, onError), [range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (s) => !q || s.clienteNombre.toLowerCase().includes(q) || s.codigoBoleta.toLowerCase().includes(q) || s.clienteTelefono?.includes(q)
    );
  }, [data, search]);

  const validas = filtered.filter((s) => s.estadoEntrega !== 'cancelado');
  const total = validas.reduce((n, s) => n + s.total, 0);

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
            <Text style={styles.summaryValue}>{validas.length}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>Total (sin anuladas)</Text>
            <Text style={[styles.summaryValue, { color: Colors.primary }]}>{soles(total)}</Text>
          </View>
        </Card>
      </View>

      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="receipt-outline" title="Sin ventas" description="No hay ventas en este periodo." />}
          renderItem={({ item }) => <SaleRow venta={item} onPress={() => router.push({ pathname: '/venta/[id]', params: { id: item.id } })} />}
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
