import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductImage, StockBadge } from '@/components/product-card';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, ConfirmDialog, ErrorView, Header, Input, KeyValue, LoadingView, PickerField, Row, Screen, Stepper, Toggle } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { parseNumber, soles } from '@/lib/format';
import { pickProductImage, type PickedImage } from '@/lib/image-picker';
import { observarCategorias } from '@/services/categorias';
import { isCloudinaryConfigured, subirImagenProducto } from '@/services/imagenes';
import { actualizarProducto, crearProducto, eliminarProducto, observarProducto } from '@/services/productos';
import { selectQuantityOf, useCart } from '@/store/cart';
import type { Categoria, Producto } from '@/types/db';

type Form = {
  nombre: string;
  descripcion: string;
  categoriaId: string | null;
  precio: string;
  costo: string;
  stock: string;
  stockMinimo: string;
  activo: boolean;
};

function formFrom(p: Producto | null): Form {
  if (!p) return { nombre: '', descripcion: '', categoriaId: null, precio: '', costo: '', stock: '0', stockMinimo: '1', activo: true };
  return {
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    categoriaId: p.categoriaId,
    precio: String(p.precio),
    costo: p.costo != null ? String(p.costo) : '',
    stock: String(p.stock),
    stockMinimo: String(p.stockMinimo),
    activo: p.activo,
  };
}

export default function ProductScreen() {
  const { isAdmin } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuevo';

  const categorias = useRealtime(observarCategorias);
  const producto = useRealtime<Producto | null>((onData, onError) => observarProducto(id, onData, onError), [id], !isNew);

  const loading = categorias.loading || (!isNew && producto.loading);
  const error = categorias.error ?? producto.error;

  if (loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={isAdmin ? (isNew ? 'Nuevo producto' : 'Editar producto') : 'Producto'} back />
        <LoadingView />
      </Screen>
    );
  }
  if (error || (!isNew && !producto.data)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Producto" back />
        <ErrorView message={error ?? 'Producto no encontrado'} />
      </Screen>
    );
  }
  if (!isAdmin) return <ProductDetail producto={producto.data!} />;
  return <ProductEditor key={producto.data?.id ?? 'nuevo'} producto={producto.data ?? null} categorias={categorias.data ?? []} />;
}

/* ------------------------------------------------------------------ */
/* Vista de solo lectura (vendedor)                                    */
/* ------------------------------------------------------------------ */

function ProductDetail({ producto }: { producto: Producto }) {
  const router = useRouter();
  const toast = useToast();
  const inCart = useCart(selectQuantityOf(producto.id));
  const add = useCart((s) => s.add);
  const decrement = useCart((s) => s.decrement);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Producto" back />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ alignItems: 'center' }}>
          <ProductImage uri={producto.fotoUrl} size={220} radius={Radius.xl} />
        </View>
        <Card style={{ gap: Spacing.sm }}>
          <Text style={styles.name}>{producto.nombre}</Text>
          {producto.categoriaNombre ? <Text style={styles.cat}>{producto.categoriaNombre}</Text> : null}
          {producto.descripcion ? <Text style={styles.desc}>{producto.descripcion}</Text> : null}
          <Row style={{ justifyContent: 'space-between', marginTop: Spacing.sm }}>
            <Text style={styles.price}>{soles(producto.precio)}</Text>
            <StockBadge stock={producto.stock} min={producto.stockMinimo} />
          </Row>
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.label}>En el carrito</Text>
          {inCart > 0 ? (
            <Stepper
              value={inCart}
              max={producto.stock}
              onIncrement={() => add(producto) === 'sin_stock' && toast.show('No hay más stock', 'error')}
              onDecrement={() => decrement(producto.id)}
            />
          ) : (
            <Button
              title="Agregar"
              icon="add"
              size="sm"
              disabled={producto.stock <= 0}
              onPress={() => (add(producto) === 'sin_stock' ? toast.show('Sin stock disponible', 'error') : toast.show('Agregado al carrito', 'success'))}
            />
          )}
        </Card>
        {inCart > 0 ? <Button title="Ver carrito" icon="cart" onPress={() => router.replace('/venta/nueva')} /> : null}
      </ScrollView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Editor (admin)                                                      */
/* ------------------------------------------------------------------ */

function ProductEditor({ producto, categorias }: { producto: Producto | null; categorias: Categoria[] }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !producto;
  const [form, setForm] = useState<Form>(() => formFrom(producto));
  const [image, setImage] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const choosePhoto = async (source: 'galeria' | 'camara') => {
    try {
      const img = await pickProductImage(source);
      if (img) setImage(img);
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    }
  };

  const save = async () => {
    if (form.nombre.trim().length < 2) return toast.show('Ingresa el nombre del producto', 'error');
    const precio = parseNumber(form.precio);
    if (precio <= 0) return toast.show('Ingresa un precio válido', 'error');
    const stock = Math.max(0, Math.round(parseNumber(form.stock)));
    const stockMinimo = Math.max(0, Math.round(parseNumber(form.stockMinimo)));
    const categoria = categorias.find((c) => c.id === form.categoriaId) ?? null;

    setSaving(true);
    try {
      const base = {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        categoriaId: categoria?.id ?? null,
        categoriaNombre: categoria?.nombre ?? null,
        precio,
        costo: form.costo ? parseNumber(form.costo) : null,
        stockMinimo,
        activo: form.activo,
      };
      let productoId = producto?.id;
      if (isNew) {
        productoId = await crearProducto({ ...base, stock });
      } else {
        await actualizarProducto(productoId!, { ...base, ...(stock !== producto.stock ? { stock } : {}) });
      }
      if (image && productoId) {
        const fotoUrl = await subirImagenProducto(image, productoId);
        await actualizarProducto(productoId, { fotoUrl });
      }
      toast.show(isNew ? 'Producto creado' : 'Producto actualizado', 'success');
      router.back();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!producto) return;
    setSaving(true);
    try {
      await eliminarProducto(producto.id);
      toast.show('Producto eliminado', 'success');
      setConfirmDelete(false);
      router.back();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const categoryOptions = categorias.map((c) => ({ value: c.id, label: c.nombre, icon: c.icono as never }));
  const previewUri = image?.uri ?? producto?.fotoUrl ?? null;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={isNew ? 'Nuevo producto' : 'Editar producto'} back />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!isCloudinaryConfigured ? <Banner tone="warning" icon="image-outline" text="Falta configurar Cloudinary en .env; podrás guardar el producto pero no subir fotos." /> : null}
          {!categorias.length ? (
            <Banner tone="info" icon="pricetags-outline" text="Aún no hay categorías. Créalas para organizar el catálogo." action="Crear" onPress={() => router.push('/categorias')} />
          ) : null}

          <Card style={{ alignItems: 'center', gap: Spacing.md }}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.preview} contentFit="cover" />
            ) : (
              <View style={[styles.preview, { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft }]}>
                <Ionicons name="image-outline" size={40} color={Colors.primaryLight} />
                <Text style={styles.hint}>Sin foto</Text>
              </View>
            )}
            <Row style={{ gap: Spacing.sm }}>
              <Button title="Galería" icon="images-outline" variant="secondary" size="sm" onPress={() => choosePhoto('galeria')} disabled={!isCloudinaryConfigured} />
              <Button title="Cámara" icon="camera-outline" variant="secondary" size="sm" onPress={() => choosePhoto('camara')} disabled={!isCloudinaryConfigured} />
            </Row>
          </Card>

          <Card style={{ gap: Spacing.md }}>
            <Input label="Nombre" placeholder="Ropero 3 puertas 1.80 m" value={form.nombre} onChangeText={(v) => set('nombre', v)} autoCapitalize="sentences" />
            <PickerField label="Categoría" value={form.categoriaId} options={categoryOptions} onChange={(v) => set('categoriaId', v)} icon="pricetags-outline" placeholder="Elegir categoría" />
            <Input label="Descripción" placeholder="Material, color, medidas…" value={form.descripcion} onChangeText={(v) => set('descripcion', v)} multiline />
            <Row style={{ gap: Spacing.md }}>
              <Input containerStyle={{ flex: 1 }} label="Precio de venta (S/)" placeholder="0.00" value={form.precio} onChangeText={(v) => set('precio', v)} keyboardType="decimal-pad" />
              <Input containerStyle={{ flex: 1 }} label="Costo (S/)" placeholder="0.00" value={form.costo} onChangeText={(v) => set('costo', v)} keyboardType="decimal-pad" />
            </Row>
            <Row style={{ gap: Spacing.md, alignItems: 'flex-start' }}>
              <Input
                containerStyle={{ flex: 1 }}
                label={isNew ? 'Stock inicial' : 'Stock actual'}
                placeholder="0"
                value={form.stock}
                onChangeText={(v) => set('stock', v)}
                keyboardType="number-pad"
                hint={isNew ? undefined : 'Solo admin. Los movimientos quedarán en el kardex desde la fase de inventario.'}
              />
              <Input containerStyle={{ flex: 1 }} label="Stock mínimo" placeholder="1" value={form.stockMinimo} onChangeText={(v) => set('stockMinimo', v)} keyboardType="number-pad" hint="Alerta al llegar a este número" />
            </Row>
            <Toggle label="Visible en el catálogo" description="Desactívalo para ocultarlo sin borrarlo" value={form.activo} onChange={(v) => set('activo', v)} />
            {form.precio && form.costo ? <KeyValue label="Margen estimado" value={soles(parseNumber(form.precio) - parseNumber(form.costo))} color={Colors.success} /> : null}
          </Card>

          <Button title={isNew ? 'Crear producto' : 'Guardar cambios'} icon="save-outline" size="lg" onPress={save} loading={saving} />
          {!isNew ? <Button title="Eliminar producto" icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDelete}
        title="¿Eliminar este producto?"
        message="Las ventas anteriores conservarán el nombre del producto. Si solo quieres ocultarlo, desactiva 'Visible en el catálogo'."
        confirmText="Eliminar"
        danger
        loading={saving}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.md, paddingBottom: Spacing.xxl },
  preview: { width: 160, height: 160, borderRadius: Radius.lg },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted },
  name: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  cat: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },
  desc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  price: { fontSize: FontSize.xxl, fontWeight: '900', color: Colors.primary },
  label: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
});
