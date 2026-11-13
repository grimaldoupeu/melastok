import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Badge, Button, Card, ConfirmDialog, Header, KeyValue, Screen } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

export default function ProfileScreen() {
  const { profile, session, isAdmin, signOut } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    setLoading(true);
    await signOut();
    setLoading(false);
    setConfirm(false);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Mi perfil" back />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={{ alignItems: 'center', gap: Spacing.sm }}>
          <Avatar text={profile?.full_name?.slice(0, 2).toUpperCase() ?? '?'} size={76} />
          <Text style={styles.name}>{profile?.full_name ?? 'Usuario'}</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
          <Badge label={isAdmin ? 'Administrador' : 'Vendedor'} icon={isAdmin ? 'shield-checkmark' : 'person'} bg={isAdmin ? Colors.successSoft : Colors.infoSoft} fg={isAdmin ? '#2B6B41' : '#2F4F80'} />
        </Card>

        <Card style={{ gap: 4 }}>
          <Text style={styles.sectionLabel}>Permisos</Text>
          <PermRow ok text="Registrar ventas y pedidos" />
          <PermRow ok text="Ver inventario y registrar movimientos de materiales" />
          <PermRow ok={isAdmin} text="Crear, editar y eliminar productos y materiales" />
          <PermRow ok={isAdmin} text="Cancelar ventas" />
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
