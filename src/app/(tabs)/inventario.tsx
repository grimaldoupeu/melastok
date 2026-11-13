import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductImage, StockBadge } from '@/components/product-card';
import { Badge, Banner, Chip, EmptyState, ErrorView, Header, IconButton, LoadingView, Row, Screen, SearchBar } from '@/components/ui';
import { Colors, FontSize, Radius, Shadow, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { qty, soles } from '@/lib/format';
import { observarMateriales } from '@/services/materiales';
import { observarProductos } from '@/services/productos';
import { observarProveedores } from '@/services/proveedores';
import { TIPOS_MATERIAL, type Material, type Producto, type Proveedor, type TipoMaterial } from '@/types/db';

type Tab = 'productos' | 'materiales' | 'proveedores';
type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: { value: Tab; label: string; icon: IconName }[] = [
  { value: 'productos', label: 'Productos', icon: 'cube' },
  { value: 'materiales', label: 'Materiales', icon: 'layers' },
  { value: 'proveedores', label: 'Proveedores', icon: 'business' },
];

function MaterialRow({ material, onPress }: { material: Material; onPress: () => void }) {
  const low = material.stock <= material.stockMinimo;
  const out = material.stock <= 0;
  const tipo = TIPOS_MATERIAL.find((t) => t.value === material.tipo);
  const detalle = [material.color, material.espesorMm ? `${qty(material.espesorMm)} mm` : null].filter(Boolean).join(' · ');
  const pct = material.stockMinimo > 0 ? Math.min(1, material.stock / (material.stockMinimo * 2)) : 1;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }, low && { borderLeftColor: out ? Colors.danger : Colors.warning }]}>
      <View style={[styles.icon, low && { backgroundColor: out ? Colors.dangerSoft : Colors.warningSoft }]}>
        <Ionicons name={(tipo?.icon ?? 'cube-outline') as IconName} size={18} color={low ? (out ? Colors.danger : Colors.warning) : Colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {material.nombre}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {detalle || tipo?.label || ''}
          {material.proveedorNombre ? ` · ${material.proveedorNombre}` : ''}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: out ? Colors.danger : low ? Colors.warning : Colors.success }]} />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[styles.stock, low && { color: out ? Colors.danger : Colors.warning }]}>
          {qty(material.stock)} <Text style={styles.unit}>{material.unidad}</Text>
        </Text>
        <Text style={styles.meta}>mín. {qty(material.stockMinimo)}</Text>
      </View>
    </Pressable>
  );
}

function ProductRow({ producto, onPress }: { producto: Producto; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }, !producto.activo && { opacity: 0.6 }]}>
      <ProductImage uri={producto.fotoUrl} size={52} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={1}>
          {producto.nombre}
        </Text>
        <Text style={styles.meta}>
          {producto.categoriaNombre ?? 'Sin categoría'} · {soles(producto.precio)}
          {!producto.activo ? ' · Oculto' : ''}
        </Text>
        <StockBadge stock={producto.stock} min={producto.stockMinimo} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.stock}>{producto.stock}</Text>
        <Text style={styles.meta}>mín. {producto.stockMinimo}</Text>
      </View>
    </Pressable>
  );
}

function ProveedorRow({ proveedor, onPress }: { proveedor: Proveedor; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}>
        <Ionicons name="business-outline" size={18} color={Colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name}>{proveedor.nombre}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[proveedor.contacto, proveedor.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function InventoryScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('productos');
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState<TipoMaterial | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);

  const productos = useRealtime(observarProductos);
  const materiales = useRealtime(observarMateriales);
  const proveedores = useRealtime(observarProveedores);

  const q = search.trim().toLowerCase();
  const productosFiltrados = useMemo(
    () =>
      (productos.data ?? []).filter(
        (p) => (!q || p.nombre.toLowerCase().includes(q) || p.categoriaNombre?.toLowerCase().includes(q)) && (!onlyLow || p.stock <= p.stockMinimo)
      ),
    [productos.data, q, onlyLow]
  );
  const materialesFiltrados = useMemo(
    () =>
      (materiales.data ?? []).filter(
        (m) =>
          (tipo === null || m.tipo === tipo) &&
          (!q || m.nombre.toLowerCase().includes(q) || m.color?.toLowerCase().includes(q) || m.proveedorNombre?.toLowerCase().includes(q)) &&
          (!onlyLow || m.stock <= m.stockMinimo)
      ),
    [materiales.data, q, tipo, onlyLow]
  );
  const proveedoresFiltrados = useMemo(
    () => (proveedores.data ?? []).filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.contacto?.toLowerCase().includes(q)),
    [proveedores.data, q]
  );

  const lowProducts = (productos.data ?? []).filter((p) => p.activo && p.stock <= p.stockMinimo).length;
  const lowMaterials = (materiales.data ?? []).filter((m) => m.stock <= m.stockMinimo).length;
  const lowCount = tab === 'productos' ? lowProducts : tab === 'materiales' ? lowMaterials : 0;

  const nuevo = () => {
    if (tab === 'productos') router.push({ pathname: '/producto/[id]', params: { id: 'nuevo' } });
    else if (tab === 'materiales') router.push({ pathname: '/material/[id]', params: { id: 'nuevo' } });
    else router.push({ pathname: '/proveedor/[id]', params: { id: 'nuevo' } });
  };

  const active = tab === 'productos' ? productos : tab === 'materiales' ? materiales : proveedores;

  return (
    <Screen>
      <Header
        title="Inventario"
        subtitle={`${productos.data?.length ?? 0} productos · ${materiales.data?.length ?? 0} materiales`}
        right={
          <Row style={{ gap: Spacing.sm }}>
            <IconButton icon="list-outline" onPress={() => router.push('/kardex')} />
            {isAdmin ? <IconButton icon="add" bg={Colors.primary} color={Colors.white} onPress={nuevo} /> : null}
          </Row>
        }
      />

      <View style={{ paddingHorizontal: Spacing.lg, gap: Spacing.md }}>
        <View style={styles.segment}>
          {TABS.map((t) => {
            const badge = t.value === 'productos' ? lowProducts : t.value === 'materiales' ? lowMaterials : 0;
            return (
              <Pressable key={t.value} onPress={() => setTab(t.value)} style={[styles.segmentBtn, tab === t.value && styles.segmentActive]}>
                <Ionicons name={t.icon} size={15} color={tab === t.value ? Colors.white : Colors.textSecondary} />
                <Text style={[styles.segmentText, tab === t.value && { color: Colors.white }]} numberOfLines={1}>
                  {t.label}
                </Text>
                {badge > 0 ? (
                  <Badge label={String(badge)} bg={tab === t.value ? 'rgba(255,255,255,0.25)' : Colors.warningSoft} fg={tab === t.value ? Colors.white : '#9A5F10'} />
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={tab === 'productos' ? 'Buscar producto…' : tab === 'materiales' ? 'Buscar material, color o proveedor…' : 'Buscar proveedor…'}
        />

        {tab !== 'proveedores' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
            <Chip label="Stock bajo" icon="warning-outline" active={onlyLow} color={Colors.warning} onPress={() => setOnlyLow((v) => !v)} />
            {tab === 'materiales' ? (
              <>
                <Chip label="Todos" active={tipo === null} onPress={() => setTipo(null)} />
                {TIPOS_MATERIAL.map((t) => (
                  <Chip key={t.value} label={t.label} active={tipo === t.value} onPress={() => setTipo(tipo === t.value ? null : t.value)} />
                ))}
              </>
            ) : null}
          </ScrollView>
        ) : null}

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

      {active.loading ? (
        <LoadingView />
      ) : active.error ? (
        <ErrorView message={active.error} />
      ) : tab === 'productos' ? (
        <FlatList
          data={productosFiltrados}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="Sin productos" description={onlyLow ? 'Ningún producto con stock bajo. ¡Bien!' : 'No hay productos que coincidan.'} />}
          renderItem={({ item }) => <ProductRow producto={item} onPress={() => router.push({ pathname: '/producto/[id]', params: { id: item.id } })} />}
        />
      ) : tab === 'materiales' ? (
        <FlatList
          data={materialesFiltrados}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="layers-outline"
              title="Sin materiales"
              description={onlyLow ? 'Ningún material por debajo del mínimo. ¡Bien!' : 'No hay materiales que coincidan.'}
              action={isAdmin && !onlyLow ? 'Agregar material' : undefined}
              onAction={nuevo}
            />
          }
          renderItem={({ item }) => <MaterialRow material={item} onPress={() => router.push({ pathname: '/material/[id]', params: { id: item.id } })} />}
        />
      ) : (
        <FlatList
          data={proveedoresFiltrados}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState icon="business-outline" title="Sin proveedores" description="Registra a quién le compras planchas, tapacanto y accesorios." action={isAdmin ? 'Agregar proveedor' : undefined} onAction={nuevo} />
          }
          renderItem={({ item }) => <ProveedorRow proveedor={item} onPress={() => router.push({ pathname: '/proveedor/[id]', params: { id: item.id } })} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: Colors.primarySoft, borderRadius: Radius.pill, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 40, borderRadius: Radius.pill, paddingHorizontal: 4 },
  segmentActive: { backgroundColor: Colors.primary },
  segmentText: { fontWeight: '700', color: Colors.textSecondary, fontSize: FontSize.xs },
  list: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: {
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
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  stock: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  unit: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  bar: { height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden', marginTop: 2 },
  barFill: { height: 4, borderRadius: 2 },
});
