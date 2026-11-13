import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Avatar, Badge, Button, Card, ConfirmDialog, Header, Input, KeyValue, Screen } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { firebaseErrorMessage } from '@/lib/firebase';
import { initials } from '@/lib/format';
import { cambiarContrasena } from '@/services/auth';

export default function ProfileScreen() {
  const router = useRouter();
  const toast = useToast();
  const { profile, user, isAdmin, signOut } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [changing, setChanging] = useState(false);

  const logout = async () => {
    setLoading(true);
    await signOut();
    setLoading(false);
    setConfirm(false);
  };

  const changePassword = async () => {
    if (password.length < 6) return toast.show('La contraseña debe tener al menos 6 caracteres', 'error');
    if (password !== password2) return toast.show('Las contraseñas no coinciden', 'error');
    setChanging(true);
    try {
      await cambiarContrasena(password);
      toast.show('Contraseña actualizada', 'success');
      setPassword('');
      setPassword2('');
      setShowPassword(false);
    } catch (e) {
      toast.show(firebaseErrorMessage(e), 'error');
    } finally {
      setChanging(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Mi perfil" back />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
          <Avatar text={initials(profile?.nombre)} size={76} />
          <Text style={styles.name}>{profile?.nombre ?? 'Usuario'}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <Badge
            label={isAdmin ? 'Administrador' : 'Vendedor'}
            icon={isAdmin ? 'shield-checkmark' : 'person'}
            bg={isAdmin ? Colors.successSoft : Colors.infoSoft}
            fg={isAdmin ? '#2B6B41' : '#2F4F80'}
          />
        </Card>

        {isAdmin ? <Button title="Gestionar usuarios" icon="people-outline" variant="secondary" onPress={() => router.push('/usuarios')} /> : null}

        <Card style={{ gap: 4 }}>
          <Text style={styles.sectionLabel}>Permisos</Text>
          <PermRow ok text="Registrar ventas y pedidos" />
          <PermRow ok text="Ver inventario y registrar ingresos de materiales" />
          <PermRow ok={isAdmin} text="Crear, editar y eliminar productos, materiales y proveedores" />
          <PermRow ok={isAdmin} text="Cancelar ventas y hacer ajustes de stock" />
          <PermRow ok={isAdmin} text="Gestionar usuarios" />
        </Card>

        <Card style={{ gap: Spacing.md }}>
          <Text style={styles.sectionLabel}>Seguridad</Text>
          {showPassword ? (
            <>
              <Input label="Nueva contraseña" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry placeholder="Mínimo 6 caracteres" />
              <Input label="Repetir contraseña" icon="lock-closed-outline" value={password2} onChangeText={setPassword2} secureTextEntry placeholder="Repite la contraseña" />
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <Button title="Cancelar" variant="ghost" onPress={() => setShowPassword(false)} style={{ flex: 1 }} />
                <Button title="Guardar" onPress={changePassword} loading={changing} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <Button title="Cambiar contraseña" icon="key-outline" variant="secondary" size="sm" onPress={() => setShowPassword(true)} />
          )}
        </Card>

        <Card style={{ gap: 4 }}>
          <Text style={styles.sectionLabel}>Aplicación</Text>
          <KeyValue label="Versión" value={Constants.expoConfig?.version ?? '1.0.0'} />
          <KeyValue label="Desarrollado por" value="GAMA Studio" />
          <KeyValue label="Zona horaria" value="America/Lima" />
        </Card>

        <Button title="Cerrar sesión" icon="log-out-outline" variant="danger" onPress={() => setConfirm(true)} />
      </ScrollView>

      <ConfirmDialog visible={confirm} title="¿Cerrar sesión?" confirmText="Salir" danger loading={loading} onConfirm={logout} onCancel={() => setConfirm(false)} />
    </Screen>
  );
}

function PermRow({ ok, text }: { ok: boolean; text: string }) {
  return (
    <View style={styles.perm}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={18} color={ok ? Colors.success : Colors.textMuted} />
      <Text style={[styles.permText, !ok && { color: Colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.md, paddingBottom: Spacing.xxl },
  name: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  email: { fontSize: FontSize.sm, color: Colors.textSecondary },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '800', color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  perm: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  permText: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
});
