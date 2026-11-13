import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, ConfirmDialog, Divider, ErrorView, Header, Input, LoadingView, PickerField, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@/hooks/use-query';
import { formatDateTime, parseNumber, qty, soles } from '@/lib/format';
import { errorMessage, supabase } from '@/lib/supabase';
import { MATERIAL_TYPES, MATERIAL_UNITS, type Material, type MaterialMovement, type MaterialType, type MovementType } from '@/types/db';

type Form = {
  name: string;
  type: MaterialType;
  color: string;
  thickness_mm: string;
  unit: string;
  stock: string;
  min_stock: string;
  unit_cost: string;
  supplier: string;
};

function formFrom(m: Material | null): Form {
  if (!m) return { name: '', type: 'plancha', color: '', thickness_mm: '', unit: 'plancha', stock: '0', min_stock: '0', unit_cost: '', supplier: '' };
  return {
    name: m.name,
    type: m.type,
    color: m.color ?? '',
    thickness_mm: m.thickness_mm != null ? String(m.thickness_mm) : '',
    unit: m.unit,
    stock: String(m.stock),
    min_stock: String(m.min_stock),
    unit_cost: m.unit_cost != null ? String(m.unit_cost) : '',
    supplier: m.supplier ?? '',
  };
}

const MOVEMENTS: { value: MovementType; label: string; icon: 'arrow-down-circle-outline' | 'arrow-up-circle-outline' | 'create-outline'; color: string }[] = [
  { value: 'entrada', label: 'Entrada', icon: 'arrow-down-circle-outline', color: Colors.success },
  { value: 'salida', label: 'Salida', icon: 'arrow-up-circle-outline', color: Colors.danger },
  { value: 'ajuste', label: 'Ajuste', icon: 'create-outline', color: Colors.info },
];

export default function MaterialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuevo';
  const [editing, setEditing] = useState(false);

  const { data, loading, error, refetch } = useQuery(
    async () => {
      if (isNew) return { material: null as Material | null, movements: [] as MaterialMovement[] };
      const [m, mv] = await Promise.all([
        supabase.from('materials').select('*').eq('id', id).single(),
        supabase.from('material_movements').select('*').eq('material_id', id).order('created_at', { ascending: false }).limit(10),
      ]);
      if (m.error) throw m.error;
      return { material: m.data as Material, movements: (mv.data ?? []) as MaterialMovement[] };
    },
    [id],
    { refetchOnFocus: false }
  );

  if (loading && !data) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Material" back />
        <LoadingView />
      </Screen>
    );
  }
  if (error || !data || (!isNew && !data.material)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Material" back />
        <ErrorView message={error ?? 'Material no encontrado'} onRetry={refetch} />
      </Screen>
    );
  }
  if (isNew || editing) {
    return (
      <MaterialEditor
        key={data.material?.id ?? 'nuevo'}
        material={data.material}
        onCancel={isNew ? undefined : () => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          refetch();
        }}
      />
    );
  }
  return <MaterialDetail material={data.material!} movements={data.movements} onEdit={() => setEditing(true)} onChanged={refetch} />;
}

/* ------------------------------------------------------------------ */
/* Detalle + movimientos                                               */
/* ------------------------------------------------------------------ */

function MaterialDetail({ material, movements, onEdit, onChanged }: { material: Material; movements: MaterialMovement[]; onEdit: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const [movType, setMovType] = useState<MovementType>('entrada');
  const [movQty, setMovQty] = useState('');
  const [movNote, setMovNote] = useState('');
  const [moving, setMoving] = useState(false);

  const low = Number(material.stock) <= Number(material.min_stock);
  const out = Number(material.stock) <= 0;
  const typeInfo = MATERIAL_TYPES.find((t) => t.value === material.type);

  const registerMovement = async () => {
    const q = parseNumber(movQty);
    if (q <= 0 && movType !== 'ajuste') return toast.show('Ingresa una cantidad mayor a 0', 'error');
    if (q < 0) return toast.show('La cantidad no puede ser negativa', 'error');
    setMoving(true);
    const { error: err } = await supabase.rpc('adjust_material_stock', { p_material_id: material.id, p_type: movType, p_quantity: q, p_note: movNote.trim() || null });
    setMoving(false);
    if (err) return toast.show(errorMessage(err), 'error');
    toast.show(movType === 'entrada' ? 'Entrada registrada' : movType === 'salida' ? 'Salida registrada' : 'Stock ajustado', 'success');
    setMovQty('');
    setMovNote('');
    onChanged();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title={material.name}
        subtitle={[typeInfo?.label, material.color, material.thickness_mm ? `${qty(material.thickness_mm)} mm` : null].filter(Boolean).join(' · ')}
        back
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {low ? (
            <Banner
              tone={out ? 'danger' : 'warning'}
              icon="alert-circle"
              text={out ? 'Material agotado. Registra una entrada para reponer.' : `Stock por debajo del mínimo (${qty(material.min_stock)} ${material.unit}).`}
            />
          ) : null}

          <Card style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.stockLabel}>Stock actual</Text>
            <Text style={[styles.stock, low && { color: out ? Colors.danger : Colors.warning }]}>
              {qty(material.stock)} <Text style={styles.unit}>{material.unit}</Text>
            </Text>
            <Row style={{ gap: Spacing.lg, marginTop: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.metaLabel}>Mínimo</Text>
                <Text style={styles.metaValue}>
                  {qty(material.min_stock)} {material.unit}
                </Text>
              </View>
              {material.unit_cost != null ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.metaLabel}>Costo unit.</Text>
                  <Text style={styles.metaValue}>{soles(material.unit_cost)}</Text>
                </View>
              ) : null}
              {material.supplier ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.metaLabel}>Proveedor</Text>
                  <Text style={styles.metaValue}>{material.supplier}</Text>
                </View>
              ) : null}
            </Row>
            {isAdmin ? <Button title="Editar datos" icon="pencil-outline" variant="ghost" size="sm" onPress={onEdit} /> : null}
          </Card>

          <SectionTitle title="Registrar movimiento" />
          <Card style={{ gap: Spacing.md }}>
            <Row style={{ gap: Spacing.sm }}>
              {MOVEMENTS.map((m) => (
                <Chip key={m.value} label={m.label} icon={m.icon} color={m.color} active={movType === m.value} onPress={() => setMovType(m.value)} style={{ flex: 1, justifyContent: 'center' }} />
              ))}
            </Row>
            <Input
              label={movType === 'ajuste' ? `Nuevo stock (${material.unit})` : `Cantidad (${material.unit})`}
              placeholder="0"
              value={movQty}
              onChangeText={setMovQty}
              keyboardType="decimal-pad"
              hint={movType === 'entrada' ? 'Compra o reposición de material' : movType === 'salida' ? 'Consumo en producción, merma o venta' : 'Corrige el stock al valor real del conteo'}
            />
            <Input label="Nota (opcional)" placeholder="Ej. compra a proveedor, uso en ropero #12" value={movNote} onChangeText={setMovNote} />
            <Button title="Registrar" icon="checkmark" onPress={registerMovement} loading={moving} />
          </Card>

          <SectionTitle title="Últimos movimientos" />
          <Card style={{ paddingVertical: Spacing.sm }}>
            {movements.length === 0 ? (
              <Text style={styles.empty}>Sin movimientos registrados</Text>
            ) : (
              movements.map((mv, i) => {
                const info = MOVEMENTS.find((m) => m.value === mv.type) ?? MOVEMENTS[2];
                return (
                  <View key={mv.id}>
                    <Row style={{ gap: Spacing.md, paddingVertical: 8 }}>
                      <Ionicons name={info.icon} size={22} color={info.color} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.mvTitle}>
                          {info.label} · {mv.type === 'ajuste' ? '=' : mv.type === 'entrada' ? '+' : '-'}
                          {qty(mv.quantity)} {material.unit}
                        </Text>
                        <Text style={styles.mvMeta}>
                          {formatDateTime(mv.created_at)}
                          {mv.note ? ` · ${mv.note}` : ''}
                        </Text>
                      </View>
                    </Row>
                    {i < movements.length - 1 ? <Divider style={{ marginVertical: 0 }} /> : null}
                  </View>
                );
              })
            )}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Editor (admin)                                                      */
/* ------------------------------------------------------------------ */

function MaterialEditor({ material, onCancel, onSaved }: { material: Material | null; onCancel?: () => void; onSaved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !material;
  const [form, setForm] = useState<Form>(() => formFrom(material));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (form.name.trim().length < 2) return toast.show('Ingresa el nombre del material', 'error');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        color: form.color.trim() || null,
        thickness_mm: form.thickness_mm ? parseNumber(form.thickness_mm) : null,
        unit: form.unit,
        min_stock: Math.max(0, parseNumber(form.min_stock)),
        unit_cost: form.unit_cost ? parseNumber(form.unit_cost) : null,
        supplier: form.supplier.trim() || null,
        ...(isNew ? { stock: Math.max(0, parseNumber(form.stock)) } : {}),
      };
      if (isNew) {
        const { error: err } = await supabase.from('materials').insert(payload);
        if (err) throw err;
        toast.show('Material creado', 'success');
        router.back();
      } else {
        const { error: err } = await supabase.from('materials').update(payload).eq('id', material.id);
        if (err) throw err;
        toast.show('Material actualizado', 'success');
        onSaved();
      }
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!material) return;
    setSaving(true);
    const { error: err } = await supabase.from('materials').delete().eq('id', material.id);
    setSaving(false);
    setConfirmDelete(false);
    if (err) return toast.show(errorMessage(err), 'error');
    toast.show('Material eliminado', 'success');
    router.back();
  };

  const typeOptions = MATERIAL_TYPES.map((t) => ({ value: t.value, label: t.label, icon: t.icon as never }));
  const unitOptions = MATERIAL_UNITS.map((u) => ({ value: u, label: u }));

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={isNew ? 'Nuevo material' : 'Editar material'} back onBack={onCancel} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: Spacing.md }}>
            <Input label="Nombre" placeholder="Plancha melamina Nogal 18 mm" value={form.name} onChangeText={(v) => set('name', v)} />
            <PickerField label="Tipo" value={form.type} options={typeOptions} onChange={(v) => set('type', v)} icon="layers-outline" />
            <Row style={{ gap: Spacing.md }}>
              <Input containerStyle={{ flex: 1 }} label="Color" placeholder="Nogal" value={form.color} onChangeText={(v) => set('color', v)} />
              <Input containerStyle={{ flex: 1 }} label="Espesor (mm)" placeholder="18" value={form.thickness_mm} onChangeText={(v) => set('thickness_mm', v)} keyboardType="decimal-pad" />
            </Row>
            <Row style={{ gap: Spacing.md }}>
              <View style={{ flex: 1 }}>
                <PickerField label="Unidad" value={form.unit} options={unitOptions} onChange={(v) => set('unit', v)} />
              </View>
              {isNew ? <Input containerStyle={{ flex: 1 }} label="Stock inicial" placeholder="0" value={form.stock} onChangeText={(v) => set('stock', v)} keyboardType="decimal-pad" /> : null}
            </Row>
            <Row style={{ gap: Spacing.md, alignItems: 'flex-start' }}>
              <Input containerStyle={{ flex: 1 }} label="Stock mínimo" placeholder="0" value={form.min_stock} onChangeText={(v) => set('min_stock', v)} keyboardType="decimal-pad" hint="Alerta al llegar a este nivel" />
              <Input containerStyle={{ flex: 1 }} label="Costo unitario (S/)" placeholder="0.00" value={form.unit_cost} onChangeText={(v) => set('unit_cost', v)} keyboardType="decimal-pad" />
            </Row>
            <Input label="Proveedor" placeholder="Maderas del Sur" value={form.supplier} onChangeText={(v) => set('supplier', v)} />
          </Card>
          <Button title={isNew ? 'Crear material' : 'Guardar cambios'} icon="save-outline" size="lg" onPress={save} loading={saving} />
          {!isNew ? <Button title="Eliminar material" icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDelete}
        title="¿Eliminar este material?"
        message="Se borrará junto con su historial de movimientos."
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
  stockLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  stock: { fontSize: FontSize.display + 6, fontWeight: '900', color: Colors.text },
  unit: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textMuted },
  metaLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaValue: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  empty: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },
  mvTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  mvMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
});
