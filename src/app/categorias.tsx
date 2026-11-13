import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, EmptyState, ErrorView, Header, IconButton, Input, LoadingView, Row, Screen } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { firebaseErrorMessage } from '@/lib/firebase';
import { actualizarCategoria, cargarCategoriasSugeridas, crearCategoria, eliminarCategoria, observarCategorias } from '@/services/categorias';
import { sincronizarNombreCategoria } from '@/services/productos';
import { CATEGORIA_ICONOS, type Categoria } from '@/types/db';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Gestión de categorías del catálogo (solo admin) */
export default function CategoriesScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const { data, loading, error } = useRealtime(observarCategorias);
  const [editing, setEditing] = useState<Categoria | 'nueva' | null>(null);
  const [toDelete, setToDelete] = useState<Categoria | null>(null);
  const [busy, setBusy] = useState(false);

  const cargarSugeridas = async () => {
    setBusy(true);
    try {
      const n = await cargarCategoriasSugeridas();
      toast.show(n ? `${n} categorías creadas` : 'Ya existen categorías', 'success');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await sincronizarNombreCategoria(toDelete.id, null);
      await eliminarCategoria(toDelete.id);
      toast.show('Categoría eliminada', 'success');
      setToDelete(null);
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Categorías" back />
        <EmptyState icon="lock-closed-outline" title="Solo para administradores" action="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title="Categorías"
        subtitle={data ? `${data.length} categorías` : undefined}
        back
        right={<IconButton icon="add" bg={Colors.primary} color={Colors.white} onPress={() => setEditing('nueva')} />}
      />
      {loading ? (
        <LoadingView />
      ) : error ? (
        <ErrorView message={error} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon="pricetags-outline"
              title="Sin categorías"
              description="Carga las categorías sugeridas (roperos, cómodas, cocinas…) o crea las tuyas."
              action="Cargar categorías sugeridas"
              onAction={cargarSugeridas}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.icon}>
                <Ionicons name={item.icono as IconName} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.name}>{item.nombre}</Text>
              <IconButton icon="pencil-outline" size={36} onPress={() => setEditing(item)} />
              <IconButton icon="trash-outline" size={36} bg={Colors.dangerSoft} color={Colors.danger} onPress={() => setToDelete(item)} />
            </Card>
          )}
        />
      )}

      {editing ? (
        <CategoryEditor
          key={editing === 'nueva' ? 'nueva' : editing.id}
          categoria={editing === 'nueva' ? null : editing}
          nextOrder={(data?.length ?? 0) + 1}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        visible={!!toDelete}
        title={`¿Eliminar "${toDelete?.nombre}"?`}
        message="Los productos de esta categoría quedarán sin categoría (no se borran)."
        confirmText="Eliminar"
        danger
        loading={busy}
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </Screen>
  );
}

function CategoryEditor({ categoria, nextOrder, onClose }: { categoria: Categoria | null; nextOrder: number; onClose: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [icono, setIcono] = useState<string>(categoria?.icono ?? 'cube-outline');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (nombre.trim().length < 2) return toast.show('Ingresa el nombre de la categoría', 'error');
    setSaving(true);
    try {
      if (categoria) {
        await actualizarCategoria(categoria.id, { nombre: nombre.trim(), icono });
        if (categoria.nombre !== nombre.trim()) await sincronizarNombreCategoria(categoria.id, nombre.trim());
        toast.show('Categoría actualizada', 'success');
      } else {
        await crearCategoria({ nombre, icono, orden: nextOrder });
        toast.show('Categoría creada', 'success');
      }
      onClose();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.sheetTitle}>{categoria ? 'Editar categoría' : 'Nueva categoría'}</Text>
            <IconButton icon="close" onPress={onClose} size={34} />
          </Row>
          <Input label="Nombre" placeholder="Roperos" value={nombre} onChangeText={setNombre} autoCapitalize="sentences" autoFocus />
          <Text style={styles.label}>Ícono</Text>
          <View style={styles.iconGrid}>
            {CATEGORIA_ICONOS.map((ic) => (
              <Pressable key={ic} onPress={() => setIcono(ic)} style={[styles.iconOption, icono === ic && styles.iconOptionActive]}>
                <Ionicons name={ic} size={22} color={icono === ic ? Colors.white : Colors.primary} />
              </Pressable>
            ))}
          </View>
          <Button title={categoria ? 'Guardar' : 'Crear categoría'} icon="save-outline" onPress={save} loading={saving} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  iconOption: { width: 48, height: 48, borderRadius: 12, backgroundColor: Colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  iconOptionActive: { backgroundColor: Colors.primary },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  sheetTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
});
