import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { ProductCard } from '@/components/product-card';
import { useToast } from '@/components/toast';
import { Chip, EmptyState, ErrorView, Fab, Header, IconButton, LoadingView, Row, Screen, SearchBar } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { soles } from '@/lib/format';
import { observarCategorias } from '@/services/categorias';
import { observarProductosActivos } from '@/services/productos';
import { selectCartCount, selectCartSubtotal, useCart } from '@/store/cart';
import type { Producto } from '@/types/db';

export default function CatalogScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);

  const categorias = useRealtime(observarCategorias);
  const productos = useRealtime(observarProductosActivos);

  const items = useCart((s) => s.items);
  const add = useCart((s) => s.add);
  const sync = useCart((s) => s.sync);
  const count = useCart(selectCartCount);
  const subtotal = useCart(selectCartSubtotal);

  // Mantiene precio y stock del carrito al día con el catálogo en tiempo real
  useEffect(() => {
    if (productos.data) sync(productos.data);
  }, [productos.data, sync]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (productos.data ?? []).filter(
      (p) =>
        (categoria === null || p.categoriaId === categoria) &&
        (!q || p.nombre.toLowerCase().includes(q) || p.descripcion?.toLowerCase().includes(q) || p.categoriaNombre?.toLowerCase().includes(q))
    );
  }, [productos.data, search, categoria]);

  const inCartOf = (id: string) => items.find((i) => i.producto.id === id)?.cantidad ?? 0;

  const handleAdd = (p: Producto) => {
    const r = add(p);
    if (r === 'sin_stock') toast.show(`No hay más stock de ${p.nombre}`, 'error');
  };

  const nuevoProducto = () => router.push({ pathname: '/producto/[id]', params: { id: 'nuevo' } });

  return (
    <Screen>
      <Header
        title="Catálogo"
        subtitle={productos.data ? `${productos.data.length} productos` : undefined}
        right={
          isAdmin ? (
            <Row style={{ gap: Spacing.sm }}>
              <IconButton icon="pricetags-outline" onPress={() => router.push('/categorias')} />
              <IconButton icon="add" bg={Colors.primary} color={Colors.white} onPress={nuevoProducto} />
            </Row>
          ) : undefined
        }
      />
      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Buscar producto…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          <Chip label="Todos" active={categoria === null} onPress={() => setCategoria(null)} />
          {(categorias.data ?? []).map((c) => (
            <Chip key={c.id} label={c.nombre} active={categoria === c.id} onPress={() => setCategoria(categoria === c.id ? null : c.id)} />
          ))}
        </ScrollView>
      </View>

      {productos.loading ? (
        <LoadingView />
      ) : productos.error ? (
        <ErrorView message={productos.error} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: Spacing.md }}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon={search ? 'search-outline' : 'cube-outline'}
              title={search ? 'Sin resultados' : 'Aún no hay productos'}
              description={
                search
                  ? `No encontramos "${search}"`
                  : categoria
                    ? 'No hay productos en esta categoría.'
                    : isAdmin
                      ? 'Crea las categorías y agrega tu primer producto.'
                      : 'El administrador aún no ha cargado productos.'
              }
              action={isAdmin ? (categorias.data?.length ? 'Agregar producto' : 'Crear categorías') : undefined}
              onAction={() => (categorias.data?.length ? nuevoProducto() : router.push('/categorias'))}
            />
          }
          renderItem={({ item }) => (
            <ProductCard
              producto={item}
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
