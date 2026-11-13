import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { KardexList } from '@/components/kardex-list';
import { Card, Chip, ErrorView, Header, LoadingView, Screen, SearchBar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useRealtime } from '@/hooks/use-realtime';
import { observarKardexReciente } from '@/services/movimientos';
import type { Movimiento } from '@/types/db';

type Filtro = 'todos' | 'ingresos' | 'consumos' | 'ventas' | 'ajustes';
const FILTROS: { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'ingresos', label: 'Ingresos' },
  { value: 'consumos', label: 'Consumos' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'ajustes', label: 'Ajustes' },
];

function coincide(m: Movimiento, f: Filtro): boolean {
  if (f === 'todos') return true;
  if (f === 'ingresos') return m.tipo === 'entrada' && !m.ventaId;
  if (f === 'consumos') return m.tipo === 'salida' && !m.ventaId;
  if (f === 'ventas') return !!m.ventaId;
  return m.tipo === 'ajuste';
}

/** Kardex general: últimos 200 movimientos de productos y materiales */
export default function KardexScreen() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [search, setSearch] = useState('');
  const { data, loading, error } = useRealtime<Movimiento[]>((onData, onError) => observarKardexReciente(onData, onError, 200));

  const movimientos = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (m) => coincide(m, filtro) && (!q || m.itemNombre.toLowerCase().includes(q) || m.usuarioNombre.toLowerCase().includes(q) || m.nota?.toLowerCase().includes(q))
    );
  }, [data, filtro, search]);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Kardex" subtitle="Últimos movimientos de inventario" back />
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md, marginBottom: Spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Buscar ítem, usuario o nota…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          {FILTROS.map((f) => (
            <Chip key={f.value} label={f.label} active={filtro === f.value} onPress={() => setFiltro(f.value)} />
          ))}
        </ScrollView>
      </View>
      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={{ paddingVertical: Spacing.sm }}>
            <KardexList
              movimientos={movimientos}
              mostrarItem
              vacio="No hay movimientos con este filtro"
              onPressItem={(m) =>
                m.itemTipo === 'material'
                  ? router.push({ pathname: '/material/[id]', params: { id: m.itemId } })
                  : router.push({ pathname: '/producto/[id]', params: { id: m.itemId } })
              }
            />
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, backgroundColor: Colors.background },
});
