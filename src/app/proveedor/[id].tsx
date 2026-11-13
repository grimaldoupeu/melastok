import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { KardexList } from '@/components/kardex-list';
import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, EmptyState, ErrorView, Header, Input, KeyValue, LoadingView, Row, Screen, SectionTitle } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { soles } from '@/lib/format';
import { openWhatsAppChat } from '@/lib/receipt';
import { observarKardexProveedor } from '@/services/movimientos';
import { actualizarProveedor, crearProveedor, eliminarProveedor, observarProveedor } from '@/services/proveedores';
import type { Movimiento, Proveedor } from '@/types/db';

export default function ProveedorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'nuevo';
  const [editing, setEditing] = useState(false);
  const proveedor = useRealtime<Proveedor | null>((onData, onError) => observarProveedor(id, onData, onError), [id], !isNew);

  if (!isNew && proveedor.loading) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Proveedor" back />
        <LoadingView />
      </Screen>
    );
  }
  if (!isNew && (proveedor.error || !proveedor.data)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Proveedor" back />
        <ErrorView message={proveedor.error ?? 'Proveedor no encontrado'} />
      </Screen>
    );
  }
  if (isNew || editing) {
    return <ProveedorEditor key={proveedor.data?.id ?? 'nuevo'} proveedor={isNew ? null : proveedor.data} onCancel={isNew ? undefined : () => setEditing(false)} onSaved={() => setEditing(false)} />;
  }
  return <ProveedorDetail proveedor={proveedor.data!} onEdit={() => setEditing(true)} />;
}

function ProveedorDetail({ proveedor, onEdit }: { proveedor: Proveedor; onEdit: () => void }) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const ingresos = useRealtime<Movimiento[]>((onData, onError) => observarKardexProveedor(proveedor.id, onData, onError, 30), [proveedor.id]);
  const comprado = (ingresos.data ?? []).reduce((n, m) => n + (m.costoUnitario ?? 0) * m.cantidad, 0);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={proveedor.nombre} subtitle="Proveedor" back />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ gap: 4 }}>
          {proveedor.contacto ? <KeyValue label="Contacto" value={proveedor.contacto} /> : null}
          {proveedor.telefono ? (
            <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={styles.kvLabel}>Teléfono</Text>
              <Row style={{ gap: Spacing.md }}>
                <Text style={styles.kvValue}>{proveedor.telefono}</Text>
                <Ionicons name="call-outline" size={20} color={Colors.primary} onPress={() => Linking.openURL(`tel:${proveedor.telefono}`)} />
                <Ionicons name="logo-whatsapp" size={20} color="#25D366" onPress={() => openWhatsAppChat(proveedor.telefono)} />
              </Row>
            </Row>
          ) : null}
          {proveedor.direccion ? <KeyValue label="Dirección" value={proveedor.direccion} /> : null}
          {proveedor.notas ? <Text style={styles.notes}>{proveedor.notas}</Text> : null}
          {!proveedor.contacto && !proveedor.telefono && !proveedor.direccion && !proveedor.notas ? <Text style={styles.notes}>Sin datos de contacto.</Text> : null}
        </Card>
        {isAdmin ? <Button title="Editar proveedor" icon="pencil-outline" variant="secondary" onPress={onEdit} /> : null}

        <SectionTitle title="Ingresos recientes" />
        <Card style={{ paddingVertical: Spacing.sm }}>
          {ingresos.data?.length ? <KeyValue label="Total comprado (últimos 30 ingresos)" value={soles(comprado)} bold /> : null}
          {ingresos.loading ? (
            <Text style={styles.notes}>Cargando…</Text>
          ) : (
            <KardexList
              movimientos={ingresos.data ?? []}
              mostrarItem
              vacio="Aún no hay ingresos de este proveedor"
              onPressItem={(m) => router.push({ pathname: '/material/[id]', params: { id: m.itemId } })}
            />
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function ProveedorEditor({ proveedor, onCancel, onSaved }: { proveedor: Proveedor | null; onCancel?: () => void; onSaved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const isNew = !proveedor;
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '');
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '');
  const [contacto, setContacto] = useState(proveedor?.contacto ?? '');
  const [direccion, setDireccion] = useState(proveedor?.direccion ?? '');
  const [notas, setNotas] = useState(proveedor?.notas ?? '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isAdmin) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Proveedor" back />
        <EmptyState icon="lock-closed-outline" title="Solo para administradores" action="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }

  const save = async () => {
    if (nombre.trim().length < 2) return toast.show('Ingresa el nombre del proveedor', 'error');
    const datos = {
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      contacto: contacto.trim() || null,
      direccion: direccion.trim() || null,
      notas: notas.trim() || null,
    };
    setSaving(true);
    try {
      if (isNew) {
        await crearProveedor(datos);
        toast.show('Proveedor creado', 'success');
        router.back();
      } else {
        await actualizarProveedor(proveedor.id, datos, proveedor.nombre);
        toast.show('Proveedor actualizado', 'success');
        onSaved();
      }
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!proveedor) return;
    setSaving(true);
    try {
      await eliminarProveedor(proveedor.id);
      toast.show('Proveedor eliminado', 'success');
      setConfirmDelete(false);
      router.back();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={isNew ? 'Nuevo proveedor' : 'Editar proveedor'} back onBack={onCancel} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Card style={{ gap: Spacing.md }}>
            <Input label="Nombre o razón social" icon="business-outline" placeholder="Maderas del Sur" value={nombre} onChangeText={setNombre} />
            <Input label="Persona de contacto" icon="person-outline" placeholder="Sr. Ramírez" value={contacto} onChangeText={setContacto} />
            <Input label="Teléfono" icon="call-outline" placeholder="987654321" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
            <Input label="Dirección" icon="location-outline" placeholder="Av. Industrial 456" value={direccion} onChangeText={setDireccion} />
            <Input label="Notas" placeholder="Días de entrega, crédito, cuenta bancaria…" value={notas} onChangeText={setNotas} multiline />
          </Card>
          <Button title={isNew ? 'Crear proveedor' : 'Guardar cambios'} icon="save-outline" size="lg" onPress={save} loading={saving} />
          {!isNew ? <Button title="Eliminar proveedor" icon="trash-outline" variant="ghost" onPress={() => setConfirmDelete(true)} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={confirmDelete}
        title="¿Eliminar este proveedor?"
        message="Los materiales quedarán sin proveedor habitual. Los ingresos del kardex conservan su nombre."
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
  kvLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  kvValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  notes: { fontSize: FontSize.sm, color: Colors.textSecondary },
});
