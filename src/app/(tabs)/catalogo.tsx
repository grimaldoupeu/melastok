import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ProductCard } from '@/components/product-card';
import { useToast } from '@/components/toast';
import { Chip, EmptyState, ErrorView, Fab, Header, IconButton, LoadingView, Screen, SearchBar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { soles } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { selectCartCount, selectCartSubtotal, useCart } from '@/store/cart';
import type { Category, Product } from '@/types/db';

async function fetchCatalog() {
  const [cats, prods] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order').order('name'),
    supabase.from('products').select('*, categories(id,name,icon)').eq('active', true).order('name'),
  ]);
  if (cats.error) throw cats.error;
  if (prods.error) throw prods.error;
  return { categories: (cats.data ?? []) as Category[], products: (prods.data ?? []) as Product[] };
}

export default function CatalogScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<number | null>(null);
  const { data, loading, error, refreshing, refresh, refetch } = useQuery(fetchCatalog, [], { realtimeTables: ['products'] });

  const items = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const count = useCart(selectCartCount);
  const subtotal = useCart(selectCartSubtotal);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.products ?? []).filter(
      (p) => (category === null || p.category_id === category) && (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    );
  }, [data, search, category]);

  const inCartOf = (id: string) => items.find((i) => i.product.id === id)?.quantity ?? 0;

  const handleAdd = (p: Product) => {
    const r = add(p);
    if (r === 'sin_stock') toast.show(`No hay más stock de ${p.name}`, 'error');
  };

  return (
    <Screen>
      <Header
        title="Catálogo"
        subtitle={data ? `${data.products.length} productos` : undefined}
        right={isAdmin ? <IconButton icon="add" bg={Colors.primary} color={Colors.white} onPress={() => router.push({ pathname: '/producto/[id]', params: { id: 'nuevo' } })} /> : undefined}
      />
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Buscar producto…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          <Chip label="Todos" active={category === null} onPress={() => setCategory(null)} />
          {(data?.categories ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(category === c.id ? null : c.id)} />
          ))}
        </ScrollView>
      </View>

      {loading && !data ? (
        <LoadingView />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: Spacing.md }}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="Sin resultados"
              description={search ? `No encontramos "${search}"` : 'No hay productos en esta categoría.'}
              action={isAdmin ? 'Agregar producto' : undefined}
              onAction={() => router.push({ pathname: '/producto/[id]', params: { id: 'nuevo' } })}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              inCart={inCartOf(item.id)}
              onAdd={() => handleAdd(item)}
              onPress={() => router.push({ pathname: '/producto/[id]', params: { id: item.id } })}
              onEdit={isAdmin ? () => router.push({ pathname: '/producto/[id]', params: { id: item.id } }) : undefined}
            />
          )}
        />
      )}

      {count > 0 ? <Fab title={`Ver carrito · ${soles(subtotal)}`} badge={count} onPress={() => router.push('/venta/nueva')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 110 },
});
