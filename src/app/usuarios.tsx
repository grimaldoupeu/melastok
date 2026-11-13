import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Avatar, Badge, Button, Card, Chip, EmptyState, Header, IconButton, Input, LoadingView, Row, Screen } from '@/components/ui';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { firebaseErrorMessage } from '@/lib/firebase';
import { initials } from '@/lib/format';
import { crearUsuario } from '@/services/auth';
import { actualizarPerfil, aprobarPerfil, observarPerfiles } from '@/services/perfiles';
import type { Perfil, Rol } from '@/types/db';

/** Gestión de usuarios (solo admin): lista en tiempo real, alta de vendedores, rol y activación */
export default function UsersScreen() {
  const router = useRouter();
  const toast = useToast();
  const { isAdmin, user } = useAuth();
  const [perfiles, setPerfiles] = useState<Perfil[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    return observarPerfiles(setPerfiles, (e) => setError(firebaseErrorMessage(e)));
  }, [isAdmin]);

  const cambiarRol = async (p: Perfil, rol: Rol) => {
    if (p.id === user?.uid) return toast.show('No puedes cambiar tu propio rol', 'error');
    setBusy(p.id);
    try {
      await actualizarPerfil(p.id, { rol });
      toast.show(`${p.nombre} ahora es ${rol}`, 'success');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const aprobar = async (p: Perfil) => {
    setBusy(p.id);
    try {
      await aprobarPerfil(p.id);
      toast.show(`${p.nombre} aprobado. Ya puede usar la app.`, 'success');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggleActivo = async (p: Perfil) => {
    if (p.id === user?.uid) return toast.show('No puedes desactivar tu propio usuario', 'error');
    setBusy(p.id);
    try {
      await actualizarPerfil(p.id, { activo: !p.activo });
      toast.show(p.activo ? `${p.nombre} desactivado` : `${p.nombre} activado`, 'success');
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!isAdmin) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Usuarios" back />
        <EmptyState icon="lock-closed-outline" title="Solo para administradores" action="Volver" onAction={() => router.back()} />
      </Screen>
    );
  }

  // Pendientes de aprobación primero (perfiles inactivos que nunca fueron aprobados o fueron desactivados)
  const pendientes = (perfiles ?? []).filter((p) => !p.activo);
  const activos = (perfiles ?? []).filter((p) => p.activo);
  const data: (Perfil | { header: string })[] = [
    ...(pendientes.length ? [{ header: `Pendientes de aprobación (${pendientes.length})` }, ...pendientes] : []),
    ...(activos.length ? [{ header: `Activos (${activos.length})` }, ...activos] : []),
  ];

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title="Usuarios"
        subtitle={perfiles ? `${perfiles.length} ${perfiles.length === 1 ? 'usuario' : 'usuarios'}${pendientes.length ? ` · ${pendientes.length} por aprobar` : ''}` : undefined}
        back
        right={<IconButton icon="person-add" bg={Colors.primary} color={Colors.white} onPress={() => setShowCreate(true)} />}
      />
      {error ? (
        <EmptyState icon="cloud-offline-outline" title="No se pudo cargar" description={error} />
      ) : !perfiles ? (
        <LoadingView />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => ('header' in item ? `h-${item.header}` : item.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState icon="people-outline" title="Sin usuarios" description="Crea el primer vendedor con el botón +" />}
          renderItem={({ item }) => {
            if ('header' in item) return <Text style={styles.sectionHeader}>{item.header}</Text>;
            const me = item.id === user?.uid;
            const pendiente = !item.activo;
            return (
              <Card style={[styles.row, pendiente && styles.rowPending]}>
                <Avatar text={initials(item.nombre)} size={44} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.name}>{item.nombre}</Text>
                    {me ? <Badge label="Tú" /> : null}
                    {pendiente ? <Badge label="Sin acceso" bg={Colors.warningSoft} fg="#9A5F10" icon="hourglass-outline" /> : null}
                  </Row>
                  <Text style={styles.email}>{item.email}</Text>
                  <Row style={{ gap: 6, marginTop: 2 }}>
                    <Chip label="Admin" active={item.rol === 'admin'} onPress={() => !me && item.rol !== 'admin' && cambiarRol(item, 'admin')} style={styles.chip} />
                    <Chip label="Vendedor" active={item.rol === 'vendedor'} onPress={() => !me && item.rol !== 'vendedor' && cambiarRol(item, 'vendedor')} style={styles.chip} />
                  </Row>
                </View>
                {pendiente ? (
                  <Button title="Aprobar" icon="checkmark" variant="success" size="sm" onPress={() => aprobar(item)} loading={busy === item.id} />
                ) : !me ? (
                  <Pressable onPress={() => toggleActivo(item)} disabled={busy === item.id} hitSlop={8} style={styles.toggle}>
                    <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
                    <Text style={styles.toggleText}>Desactivar</Text>
                  </Pressable>
                ) : null}
              </Card>
            );
          }}
        />
      )}

      <CreateUserModal visible={showCreate} onClose={() => setShowCreate(false)} />
    </Screen>
  );
}

function CreateUserModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<Rol>('vendedor');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setNombre('');
    setEmail('');
    setPassword('');
    setRol('vendedor');
  };

  const submit = async () => {
    if (nombre.trim().length < 2) return toast.show('Ingresa el nombre', 'error');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.show('Ingresa un correo válido', 'error');
    if (password.length < 6) return toast.show('La contraseña debe tener al menos 6 caracteres', 'error');
    setSaving(true);
    try {
      await crearUsuario({ nombre, email, password, rol });
      toast.show(`Usuario ${nombre.trim()} creado`, 'success');
      reset();
      onClose();
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.sheet}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={styles.sheetTitle}>Nuevo usuario</Text>
            <IconButton icon="close" onPress={onClose} size={34} />
          </Row>
          <ScrollView contentContainerStyle={{ gap: Spacing.md }} keyboardShouldPersistTaps="handled">
            <Input label="Nombre" icon="person-outline" placeholder="Carlos Pérez" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
            <Input label="Correo" icon="mail-outline" placeholder="carlos@correo.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
            <Input label="Contraseña" icon="lock-closed-outline" placeholder="Mínimo 6 caracteres" value={password} onChangeText={setPassword} secureTextEntry hint="Compártela con el usuario; podrá cambiarla desde su perfil" />
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Rol</Text>
              <Row style={{ gap: Spacing.sm }}>
                <Chip label="Vendedor" icon="person-outline" active={rol === 'vendedor'} onPress={() => setRol('vendedor')} />
                <Chip label="Administrador" icon="shield-checkmark-outline" active={rol === 'admin'} onPress={() => setRol('admin')} />
              </Row>
            </View>
            <Button title="Crear usuario" icon="person-add-outline" size="lg" onPress={submit} loading={saving} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  list: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowPending: { borderLeftWidth: 4, borderLeftColor: Colors.warning },
  sectionHeader: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm },
  name: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  email: { fontSize: FontSize.xs, color: Colors.textMuted },
  chip: { height: 30, paddingHorizontal: 10 },
  toggle: { alignItems: 'center', gap: 2, minWidth: 56 },
  toggleText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  label: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textSecondary },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    maxHeight: '90%',
  },
  sheetTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
});
