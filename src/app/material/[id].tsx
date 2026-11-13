import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AjusteStockModal } from '@/components/ajuste-stock-modal';
import { KardexList } from '@/components/kardex-list';
import { useToast } from '@/components/toast';
import { Banner, Button, Card, Chip, ConfirmDialog, EmptyState, ErrorView, Header, Input, LoadingView, PickerField, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { parseNumber, qty, soles } from '@/lib/format';
import { crearMaterial, ingresarMaterial, registrarConsumoMaterial } from '@/services/inventario';
import { actualizarMaterial, eliminarMaterial, observarMaterial, type MaterialInput } from '@/services/materiales';
import { observarKardexItem } from '@/services/movimientos';
import { observarProveedores } from '@/services/proveedores';
import { TIPOS_MATERIAL, UNIDADES_MATERIAL, type Material, type Movimiento, type Proveedor, type TipoMaterial } from '@/types/db';

const SIN_PROVEEDOR = '__ninguno__';

export default function MaterialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuevo';
  const [editing, setEditing] = useState(false);

  const material = useRealtime<Material | null>((onData, onError) => observarMaterial(id, onData, onError), [id], !isNew);
  const proveedores = useRealtime(observarProveedores);

  if (!isNew && material.loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Material" back />
        <LoadingView />
      </Screen>
    );
  }
  if (!isNew && (material.error || !material.data)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Material" back />
        <ErrorView message={material.error ?? 'Material no encontrado'} />
      </Screen>
    );
  }
  if (isNew || editing) {
    return (
      <MaterialEditor
        key={material.data?.id ?? 'nuevo'}
        material={isNew ? null : material.data}
        proveedores={proveedores.data ?? []}
        onCancel={isNew ? undefined : () => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }
  return <MaterialDetail material={material.data!} proveedores={proveedores.data ?? []} onEdit={() => setEditing(true)} />;
}

/* ------------------------------------------------------------------ */
/* Detalle: ingreso, consumo, ajuste y kardex                          */
/* ------------------------------------------------------------------ */

type Operacion = 'ingreso' | 'consumo';

function MaterialDetail({ material, proveedores, onEdit }: { material: Material; proveedores: Proveedor[]; onEdit: () => void }) {
  const toast = useToast();
  const { isAdmin, user, profile } = useAuth();
  const [op, setOp] = useState<Operacion>('ingreso');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState(material.ultimoCosto != null ? String(material.ultimoCosto) : '');
  const [proveedorId, setProveedorId] = useState<string>(material.proveedorId ?? SIN_PROVEEDOR);
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAjuste, setShowAjuste] = useState(false);

  const kardex = useRealtime<Movimiento[]>((onData, onError) => observarKardexItem(material.id, onData, onError, 30), [material.id]);

  const low = material.stock <= material.stockMinimo;
  const out = material.stock <= 0;
  const tipo = TIPOS_MATERIAL.find((t) => t.value === material.tipo);

  const registrar = async () => {
    if (!user || !profile) return;
    const n = parseNumber(cantidad);
    if (!(n > 0)) return toast.show('Ingresa una cantidad mayor a 0', 'error');
    const usuario = { uid: user.uid, nombre: profile.nombre };
    setSaving(true);
    try {
      if (op === 'ingreso') {
        const prov = proveedores.find((p) => p.id === proveedorId) ?? null;
        await ingresarMaterial(
          {
            materialId: material.id,
            cantidad: n,
            costoUnitario: costo.trim() ? parseNumber(costo) : null,
            proveedor: prov ? { id: prov.id, nombre: prov.nombre } : null,
            nota: nota.trim() || null,
          },
          usuario
        );
        toast.show(`Ingreso de ${qty(n)} ${material.unidad} registrado`, 'success');
      } else {
        await registrarConsumoMaterial({ materialId: material.id, cantidad: n, nota: nota.trim() || null }, usuario);
        toast.show(`Consumo de ${qty(n)} ${material.unidad} registrado`, 'success');
      }
      setCantidad('');
      setNota('');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const proveedorOptions = [{ value: SIN_PROVEEDOR, label: 'Sin proveedor' }, ...proveedores.map((p) => ({ value: p.id, label: p.nombre }))];
  const total = parseNumber(cantidad) * parseNumber(costo);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={material.nombre} subtitle={[tipo?.label, material.color, material.espesorMm ? `${qty(material.espesorMm)} mm` : null].filter(Boolean).join(' · ')} back />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {low ? (
            <Banner
              tone={out ? 'danger' : 'warning'}
              icon="alert-circle"
              text={out ? 'Material agotado. Registra un ingreso para reponer.' : `Stock por debajo del mínimo (${qty(material.stockMinimo)} ${material.unidad}).`}
            />
          ) : null}

          <Card style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.stockLabel}>Stock actual</Text>
            <Text style={[styles.stock, low && { color: out ? Colors.danger : Colors.warning }]}>
              {qty(material.stock)} <Text style={styles.unit}>{material.unidad}</Text>
            </Text>
            <Row style={{ gap: Spacing.lg, marginTop: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.metaLabel}>Mínimo</Text>
                <Text style={styles.metaValue}>
                  {qty(material.stockMinimo)} {material.unidad}
                </Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.metaLabel}>Último costo</Text>
                <Text style={styles.metaValue}>{material.ultimoCosto != null ? soles(material.ultimoCosto) : '—'}</Text>
              </View>
              {material.proveedorNombre ? (
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.metaLabel}>Proveedor</Text>
                  <Text style={styles.metaValue}>{material.proveedorNombre}</Text>
                </View>
              ) : null}
            </Row>
            {isAdmin ? (
              <Row style={{ gap: Spacing.sm, marginTop: Spacing.sm }}>
                <Button title="Ajustar stock" icon="create-outline" variant="secondary" size="sm" onPress={() => setShowAjuste(true)} />
                <Button title="Editar datos" icon="pencil-outline" variant="ghost" size="sm" onPress={onEdit} />
              </Row>
            ) : null}
          </Card>

          <SectionTitle title="Registrar movimiento" />
          <Card style={{ gap: Spacing.md }}>
            <Row style={{ gap: Spacing.sm }}>
              <Chip label="Ingreso" icon="arrow-down-circle-outline" color={Colors.success} active={op === 'ingreso'} onPress={() => setOp('ingreso')} style={{ flex: 1, justifyContent: 'center' }} />
              <Chip label="Consumo" icon="arrow-up-circle-outline" color={Colors.danger} active={op === 'consumo'} onPress={() => setOp('consumo')} style={{ flex: 1, justifyContent: 'center' }} />
            </Row>
            <Input
              label={`Cantidad (${material.unidad})`}
              placeholder="0"
              value={cantidad}
              onChangeText={setCantidad}
              keyboardType="decimal-pad"
              hint={op === 'ingreso' ? 'Compra o reposición de material' : 'Uso en producción (corte, armado, merma de taller)'}
            />
            {op === 'ingreso' ? (
              <>
                <Input
                  label="Costo unitario (S/)"
                  placeholder="0.00"
                  value={costo}
                  onChangeText={setCosto}
                  keyboardType="decimal-pad"
                  hint={parseNumber(cantidad) > 0 && parseNumber(costo) > 0 ? `Total de la compra: ${soles(total)}` : 'Actualiza el último costo del material'}
                />
                <PickerField label="Proveedor" value={proveedorId} options={proveedorOptions} onChange={setProveedorId} icon="business-outline" />
              </>
            ) : null}
            <Input label="Nota (opcional)" placeholder={op === 'ingreso' ? 'N° de factura o guía' : 'Ej. ropero pedido P-0012'} value={nota} onChangeText={setNota} />
            <Button title={op === 'ingreso' ? 'Registrar ingreso' : 'Registrar consumo'} icon="checkmark" onPress={registrar} loading={saving} />
          </Card>

          <SectionTitle title="Kardex" />
          <Card style={{ paddingVertical: Spacing.sm }}>
            {kardex.loading ? <Text style={styles.metaLabel}>Cargando…</Text> : <KardexList movimientos={kardex.data ?? []} unidad={material.unidad} />}
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <AjusteStockModal
        visible={showAjuste}
        onClose={() => setShowAjuste(false)}
        itemTipo="material"
        itemId={material.id}
        nombre={material.nombre}
        stockActual={material.stock}
        unidad={material.unidad}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Editor (admin)                                                      */
/* ------------------------------------------------------------------ */

type Form = {
  nombre: string;
  tipo: TipoMaterial;
  color: string;
  espesorMm: string;
  unidad: string;
  stock: string;
  stockMinimo: string;
  ultimoCosto: string;
  proveedorId: string;
};

function formFrom(m: Material | null): Form {
  if (!m) return { nombre: '', tipo: 'plancha', color: '', espesorMm: '', unidad: 'plancha', stock: '0', stockMinimo: '0', ultimoCosto: '', proveedorId: SIN_PROVEEDOR };
  return {
    nombre: m.nombre,
    tipo: m.tipo,
    color: m.color ?? '',
    espesorMm: m.espesorMm != null ? String(m.espesorMm) : '',
    unidad: m.unidad,
    stock: String(m.stock),
    stockMinimo: String(m.stockMinimo),
    ultimoCosto: m.ultimoCosto != null ? String(m.ultimoCosto) : '',
    proveedorId: m.proveedorId ?? SIN_PROVEEDOR,
  };
}

function MaterialEditor({
  material,
  proveedores,
  onCancel,
  onSaved,
}: {
  material: Material | null;
  proveedores: Proveedor[];
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user, profile } = useAuth();
  const isNew = !material;
  const [form, setForm] = useState<Form>(() => formFrom(material));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (!isAdmin) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Material" back />
        <EmptyState icon="lock-closed-outline" title="Solo para administradores" action="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }

  const save = async () => {
    if (form.nombre.trim().length < 2) return toast.show('Ingresa el nombre del material', 'error');
    if (!user || !profile) return;
    const prov = proveedores.find((p) => p.id === form.proveedorId) ?? null;
    const datos: MaterialInput = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      color: form.color.trim() || null,
      espesorMm: form.espesorMm ? parseNumber(form.espesorMm) : null,
      unidad: form.unidad,
      stockMinimo: Math.max(0, parseNumber(form.stockMinimo)),
      ultimoCosto: form.ultimoCosto ? parseNumber(form.ultimoCosto) : null,
      proveedorId: prov?.id ?? null,
      proveedorNombre: prov?.nombre ?? null,
    };
    setSaving(true);
    try {
      if (isNew) {
        await crearMaterial(datos, parseNumber(form.stock), { uid: user.uid, nombre: profile.nombre });
        toast.show('Material creado', 'success');
        router.back();
      } else {
        await actualizarMaterial(material.id, datos);
        toast.show('Material actualizado', 'success');
        onSaved();
      }
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!material) return;
    setSaving(true);
    try {
      await eliminarMaterial(material.id);
      toast.show('Material eliminado', 'success');
      setConfirmDelete(false);
      router.back();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const typeOptions = TIPOS_MATERIAL.map((t) => ({ value: t.value, label: t.label, icon: t.icon as never }));
  const unitOptions = UNIDADES_MATERIAL.map((u) => ({ value: u, label: u }));
  const proveedorOptions = [{ value: SIN_PROVEEDOR, label: 'Sin proveedor' }, ...proveedores.map((p) => ({ value: p.id, label: p.nombre }))];

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={isNew ? 'Nuevo material' : 'Editar material'} back onBack={onCancel} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: Spacing.md }}>
            <Input label="Nombre" placeholder="Plancha melamina Nogal 18 mm" value={form.nombre} onChangeText={(v) => set('nombre', v)} />
            <PickerField label="Tipo" value={form.tipo} options={typeOptions} onChange={(v) => set('tipo', v)} icon="layers-outline" />
            <Row style={{ gap: Spacing.md }}>
              <Input containerStyle={{ flex: 1 }} label="Color" placeholder="Nogal" value={form.color} onChangeText={(v) => set('color', v)} />
              <Input containerStyle={{ flex: 1 }} label="Espesor (mm)" placeholder="18" value={form.espesorMm} onChangeText={(v) => set('espesorMm', v)} keyboardType="decimal-pad" />
            </Row>
            <Row style={{ gap: Spacing.md, alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <PickerField label="Unidad" value={form.unidad} options={unitOptions} onChange={(v) => set('unidad', v)} />
              </View>
              {isNew ? (
                <Input containerStyle={{ flex: 1 }} label="Stock inicial" placeholder="0" value={form.stock} onChangeText={(v) => set('stock', v)} keyboardType="decimal-pad" hint="Se registra en el kardex" />
              ) : (
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.fieldLabel}>Stock</Text>
                  <Text style={styles.hint}>Se cambia con ingresos, consumos o “Ajustar stock”.</Text>
                </View>
              )}
            </Row>
            <Row style={{ gap: Spacing.md, alignItems: 'flex-start' }}>
              <Input containerStyle={{ flex: 1 }} label="Stock mínimo" placeholder="0" value={form.stockMinimo} onChangeText={(v) => set('stockMinimo', v)} keyboardType="decimal-pad" hint="Alerta al llegar a este nivel" />
              <Input containerStyle={{ flex: 1 }} label="Último costo (S/)" placeholder="0.00" value={form.ultimoCosto} onChangeText={(v) => set('ultimoCosto', v)} keyboardType="decimal-pad" />
            </Row>
            <PickerField label="Proveedor habitual" value={form.proveedorId} options={proveedorOptions} onChange={(v) => set('proveedorId', v)} icon="business-outline" />
          </Card>
          <Button title={isNew ? 'Crear material' : 'Guardar cambios'} icon="save-outline" size="lg" onPress={save} loading={saving} />
          {!isNew ? <Button title="Eliminar material" icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDelete}
        title="¿Eliminar este material?"
        message="Su historial en el kardex se conserva, pero el material dejará de aparecer en el inventario."
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
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted },
});
