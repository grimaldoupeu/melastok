import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProductImage, StockBadge } from '@/components/product-card';
import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, ErrorView, Header, Input, KeyValue, LoadingView, PickerField, Row, Screen, Stepper, Toggle } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { parseNumber, soles } from '@/lib/format';
import { pickProductImage, uploadProductImage, type PickedImage } from '@/lib/storage';
import { errorMessage, supabase } from '@/lib/supabase';
import { selectQuantityOf, useCart } from '@/store/cart';
import type { Category, Product } from '@/types/db';

type Form = {
  name: string;
  description: string;
  category_id: number | null;
  price: string;
  cost: string;
  stock: string;
  min_stock: string;
  active: boolean;
};

function formFrom(p: Product | null): Form {
  if (!p) return { name: '', description: '', category_id: null, price: '', cost: '', stock: '0', min_stock: '1', active: true };
  return {
    name: p.name,
    description: p.description ?? '',
    category_id: p.category_id,
    price: String(p.price),
    cost: p.cost != null ? String(p.cost) : '',
    stock: String(p.stock),
    min_stock: String(p.min_stock),
    active: p.active,
  };
}

export default function ProductScreen() {
  const { isAdmin } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuevo';

  const { data, loading, error, refetch } = useQuery(
    async () => {
      const cats = await supabase.from('categories').select('*').order('sort_order').order('name');
      if (cats.error) throw cats.error;
      let product: Product | null = null;
      if (!isNew) {
        const p = await supabase.from('products').select('*, categories(id,name,icon)').eq('id', id).single();
        if (p.error) throw p.error;
        product = p.data as Product;
      }
      return { categories: (cats.data ?? []) as Category[], product };
    },
    [id],
    { refetchOnFocus: false }
  );

  if (loading && !data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title={isAdmin ? (isNew ? 'Nuevo producto' : 'Editar producto') : 'Producto'} back />
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data || (!isNew && !data.product)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Producto" back />
        <ErrorView message={error ?? 'Producto no encontrado'} onRetry={refetch} />
      </Screen>
    );
  }
  if (!isAdmin) return <ProductDetail product={data.product!} />;
  return <ProductEditor key={data.product?.id ?? 'nuevo'} product={data.product} categories={data.categories} />;
}

/* ------------------------------------------------------------------ */
/* Vista de solo lectura (vendedor)                                    */
/* ------------------------------------------------------------------ */

function ProductDetail({ product }: { product: Product }) {
  const router = useRouter();
  const toast = useToast();
  const inCart = useCart(selectQuantityOf(product.id));
  const add = useCart((s) => s.add);
  const decrement = useCart((s) => s.decrement);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Producto" back />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ alignItems: 'center' }}>
          <ProductImage uri={product.image_url} size={220} radius={Radius.xl} />
        </View>
        <Card style={{ gap: Spacing.sm }}>
          <Text style={styles.name}>{product.name}</Text>
          {product.categories?.name ? <Text style={styles.cat}>{product.categories.name}</Text> : null}
          {product.description ? <Text style={styles.desc}>{product.description}</Text> : null}
          <Row style={{ justifyContent: 'space-between', marginTop: Spacing.sm }}>
            <Text style={styles.price}>{soles(product.price)}</Text>
            <StockBadge stock={product.stock} min={product.min_stock} />
          </Row>
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={styles.label}>En el carrito</Text>
          {inCart > 0 ? (
            <Stepper
              value={inCart}
              max={product.stock}
              onIncrement={() => add(product) === 'sin_stock' && toast.show('No hay más stock', 'error')}
              onDecrement={() => decrement(product.id)}
            />
          ) : (
            <Button
              title="Agregar"
              icon="add"
              size="sm"
              disabled={product.stock <= 0}
              onPress={() => (add(product) === 'sin_stock' ? toast.show('Sin stock disponible', 'error') : toast.show('Agregado al carrito', 'success'))}
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

function ProductEditor({ product, categories }: { product: Product | null; categories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !product;
  const [form, setForm] = useState<Form>(() => formFrom(product));
  const [image, setImage] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const choosePhoto = async (source: 'galeria' | 'camara') => {
    try {
      const img = await pickProductImage(source);
      if (img) setImage(img);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  const save = async () => {
    if (form.name.trim().length < 2) return toast.show('Ingresa el nombre del producto', 'error');
    const price = parseNumber(form.price);
    if (price <= 0) return toast.show('Ingresa un precio válido', 'error');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_id: form.category_id,
        price,
        cost: form.cost ? parseNumber(form.cost) : null,
        stock: Math.max(0, Math.round(parseNumber(form.stock))),
        min_stock: Math.max(0, Math.round(parseNumber(form.min_stock))),
        active: form.active,
      };
      let productId = product?.id;
      if (isNew) {
        const { data: created, error: err } = await supabase.from('products').insert(payload).select('id').single();
        if (err) throw err;
        productId = (created as { id: string }).id;
      } else {
        const { error: err } = await supabase.from('products').update(payload).eq('id', productId!);
        if (err) throw err;
      }
      if (image && productId) {
        const url = await uploadProductImage(image, productId);
        const { error: err } = await supabase.from('products').update({ image_url: url }).eq('id', productId);
        if (err) throw err;
      }
      toast.show(isNew ? 'Producto creado' : 'Producto actualizado', 'success');
      router.back();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!product) return;
    setSaving(true);
    const { error: err } = await supabase.from('products').delete().eq('id', product.id);
    setSaving(false);
    setConfirmDelete(false);
    if (err) {
      toast.show(errorMessage(err), 'error');
      return;
    }
    toast.show('Producto eliminado', 'success');
    router.back();
  };

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon as never }));
  const previewUri = image?.uri ?? product?.image_url ?? null;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={isNew ? 'Nuevo producto' : 'Editar producto'} back />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
              <Button title="Galería" icon="images-outline" variant="secondary" size="sm" onPress={() => choosePhoto('galeria')} />
              <Button title="Cámara" icon="camera-outline" variant="secondary" size="sm" onPress={() => choosePhoto('camara')} />
            </Row>
          </Card>

          <Card style={{ gap: Spacing.md }}>
            <Input label="Nombre" placeholder="Ropero 3 puertas 1.80 m" value={form.name} onChangeText={(v) => set('name', v)} autoCapitalize="sentences" />
            <PickerField label="Categoría" value={form.category_id} options={categoryOptions} onChange={(v) => set('category_id', v)} icon="pricetags-outline" placeholder="Elegir categoría" />
            <Input label="Descripción" placeholder="Material, color, medidas…" value={form.description} onChangeText={(v) => set('description', v)} multiline />
            <Row style={{ gap: Spacing.md }}>
              <Input containerStyle={{ flex: 1 }} label="Precio de venta (S/)" placeholder="0.00" value={form.price} onChangeText={(v) => set('price', v)} keyboardType="decimal-pad" />
              <Input containerStyle={{ flex: 1 }} label="Costo (S/)" placeholder="0.00" value={form.cost} onChangeText={(v) => set('cost', v)} keyboardType="decimal-pad" />
            </Row>
            <Row style={{ gap: Spacing.md, alignItems: 'flex-start' }}>
              <Input containerStyle={{ flex: 1 }} label="Stock actual" placeholder="0" value={form.stock} onChangeText={(v) => set('stock', v)} keyboardType="number-pad" />
              <Input containerStyle={{ flex: 1 }} label="Stock mínimo" placeholder="1" value={form.min_stock} onChangeText={(v) => set('min_stock', v)} keyboardType="number-pad" hint="Alerta al llegar a este número" />
            </Row>
            <Toggle label="Visible en el catálogo" description="Desactívalo para ocultarlo sin borrarlo" value={form.active} onChange={(v) => set('active', v)} />
            {form.price && form.cost ? <KeyValue label="Margen estimado" value={soles(parseNumber(form.price) - parseNumber(form.cost))} color={Colors.success} /> : null}
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
