import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductImage, StockBadge } from '@/components/product-card';
import { Badge, Banner, Chip, EmptyState, ErrorView, Header, IconButton, LoadingView, Screen, SearchBar } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { useRealtime } from '@/hooks/use-realtime';
import { qty, soles } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { observarProductos } from '@/services/productos';
import { MATERIAL_TYPES, type Material, type MaterialType, type Producto } from '@/types/db';

type Tab = 'productos' | 'materiales';

// Materiales: todavía en Supabase (se migran en la fase 4)
async function fetchMaterials() {
  const mats = await supabase.from('materials').select('*').order('type').order('name');
  if (mats.error) throw mats.error;
  return (mats.data ?? []) as Material[];
}

function MaterialRow({ material, onPress }: { material: Material; onPress: () => void }) {
  const low = Number(material.stock) <= Number(material.min_stock);
  const out = Number(material.stock) <= 0;
  const typeInfo = MATERIAL_TYPES.find((t) => t.value === material.type);
  const detail = [material.color, material.thickness_mm ? `${qty(material.thickness_mm)} mm` : null].filter(Boolean).join(' · ');
  const pct = material.min_stock > 0 ? Math.min(1, Number(material.stock) / (Number(material.min_stock) * 2)) : 1;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.matRow, pressed && { opacity: 0.85 }, low && { borderLeftColor: out ? Colors.danger : Colors.warning }]}>
      <View style={[styles.matIcon, low && { backgroundColor: out ? Colors.dangerSoft : Colors.warningSoft }]}>
        <Ionicons name={(typeInfo?.icon ?? 'cube-outline') as never} size={18} color={low ? (out ? Colors.danger : Colors.warning) : Colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.matName} numberOfLines={1}>
          {material.name}
        </Text>
        <Text style={styles.matMeta} numberOfLines={1}>
          {detail || typeInfo?.label || ''}
          {material.supplier ? ` · ${material.supplier}` : ''}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: out ? Colors.danger : low ? Colors.warning : Colors.success }]} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[styles.matStock, low && { color: out ? Colors.danger : Colors.warning }]}>
          {qty(material.stock)} <Text style={styles.matUnit}>{material.unit}</Text>
        </Text>
        <Text style={styles.matMeta}>mín. {qty(material.min_stock)}</Text>
      </View>
    </Pressable>
  );
}

function ProductRow({ producto, onPress }: { producto: Producto; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.prodRow, pressed && { opacity: 0.85 }, !producto.activo && { opacity: 0.6 }]}>
      <ProductImage uri={producto.fotoUrl} size={52} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.matName} numberOfLines={1}>
          {producto.nombre}
        </Text>
        <Text style={styles.matMeta}>
          {producto.categoriaNombre ?? 'Sin categoría'} · {soles(producto.precio)}
          {!producto.activo ? ' · Oculto' : ''}
        </Text>
        <StockBadge stock={producto.stock} min={producto.stockMinimo} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.matStock}>{producto.stock}</Text>
        <Text style={styles.matMeta}>mín. {producto.stockMinimo}</Text>
      </View>
    </Pressable>
  );
}

export default function InventoryScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('productos');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MaterialType | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const productosRt = useRealtime(observarProductos);
  const { data: materialsData, loading, error, refreshing, refresh, refetch } = useQuery(fetchMaterials, []);

  const q = search.trim().toLowerCase();
  const products = useMemo(
    () =>
      (productosRt.data ?? []).filter(
        (p) => (!q || p.nombre.toLowerCase().includes(q) || p.categoriaNombre?.toLowerCase().includes(q)) && (!onlyLow || p.stock <= p.stockMinimo)
      ),
    [productosRt.data, q, onlyLow]
  );
  const materials = useMemo(
    () =>
      (materialsData ?? []).filter(
        (m) =>
          (type === null || m.type === type) &&
          (!q || m.name.toLowerCase().includes(q) || m.color?.toLowerCase().includes(q)) &&
          (!onlyLow || Number(m.stock) <= Number(m.min_stock))
      ),
    [materialsData, q, type, onlyLow]
  );

  const lowProducts = (productosRt.data ?? []).filter((p) => p.activo && p.stock <= p.stockMinimo).length;
  const lowMaterials = (materialsData ?? []).filter((m) => Number(m.stock) <= Number(m.min_stock)).length;
  const lowCount = tab === 'productos' ? lowProducts : lowMaterials;

  const addRoute = tab === 'productos' ? { pathname: '/producto/[id]' as const, params: { id: 'nuevo' } } : { pathname: '/material/[id]' as const, params: { id: 'nuevo' } };

  return (
    <Screen>
      <Header
        title="Inventario"
        subtitle={productosRt.data ? `${productosRt.data.length} productos · ${materialsData?.length ?? 0} materiales` : undefined}
        right={isAdmin ? <IconButton icon="add" bg={Colors.primary} color={Colors.white} onPress={() => router.push(addRoute)} /> : undefined}
      />

      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
        <View style={styles.segment}>
          {(['productos', 'materiales'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.segmentBtn, tab === t && styles.segmentActive]}>
              <Ionicons name={t === 'productos' ? 'cube' : 'layers'} size={16} color={tab === t ? Colors.white : Colors.textSecondary} />
              <Text style={[styles.segmentText, tab === t && { color: Colors.white }]}>{t === 'productos' ? 'Productos' : 'Materiales'}</Text>
              {(t === 'productos' ? lowProducts : lowMaterials) > 0 ? (
                <Badge label={String(t === 'productos' ? lowProducts : lowMaterials)} bg={tab === t ? 'rgba(255,255,255,0.25)' : Colors.warningSoft} fg={tab === t ? Colors.white : '#9A5F10'} />
              ) : null}
            </Pressable>
          ))}
        </View>

        <SearchBar value={search} onChangeText={setSearch} placeholder={tab === 'productos' ? 'Buscar producto…' : 'Buscar material o color…'} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
          <Chip label="Stock bajo" icon="warning-outline" active={onlyLow} color={Colors.warning} onPress={() => setOnlyLow((v) => !v)} />
          {tab === 'materiales' ? (
            <>
              <Chip label="Todos" active={type === null} onPress={() => setType(null)} />
              {MATERIAL_TYPES.map((t) => (
                <Chip key={t.value} label={t.label} active={type === t.value} onPress={() => setType(type === t.value ? null : t.value)} />
              ))}
            </>
          ) : null}
        </ScrollView>

        {lowCount > 0 && !onlyLow ? (
          <Banner
            tone="warning"
            icon="alert-circle"
            text={
              tab === 'productos'
                ? `${lowCount} producto${lowCount === 1 ? '' : 's'} con stock bajo o agotado`
                : `${lowCount} material${lowCount === 1 ? '' : 'es'} por agotarse (debajo del mínimo)`
            }
            action="Ver"
            onPress={() => setOnlyLow(true)}
          />
        ) : null}
      </View>

      {tab === 'productos' ? (
        productosRt.loading ? (
          <LoadingView />
        ) : productosRt.error ? (
          <ErrorView message={productosRt.error} />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<EmptyState icon="cube-outline" title="Sin productos" description={onlyLow ? 'Ningún producto con stock bajo. ¡Bien!' : 'No hay productos que coincidan.'} />}
            renderItem={({ item }) => <ProductRow producto={item} onPress={() => router.push({ pathname: '/producto/[id]', params: { id: item.id } })} />}
          />
        )
      ) : loading && !materialsData ? (
        <LoadingView />
      ) : error && !materialsData ? (
        <ErrorView message={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={materials}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="layers-outline"
              title="Sin materiales"
              description={onlyLow ? 'Ningún material por debajo del mínimo. ¡Bien!' : 'No hay materiales que coincidan.'}
              action={isAdmin ? 'Agregar material' : undefined}
              onAction={() => router.push({ pathname: '/material/[id]', params: { id: 'nuevo' } })}
            />
          }
          renderItem={({ item }) => <MaterialRow material={item} onPress={() => router.push({ pathname: '/material/[id]', params: { id: item.id } })} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: Colors.primarySoft, borderRadius: Radius.pill, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40, borderRadius: Radius.pill },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { fontWeight: '700', color: Colors.textSecondary, fontSize: FontSize.sm },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  matRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: 'transparent',
    ...Shadow.card,
  },
  matIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  matName: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  matMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  matStock: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  matUnit: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  bar: { height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden', marginTop: 2 },
  barFill: { height: 4, borderRadius: 2 },
  prodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    ...Shadow.card,
  },
});
