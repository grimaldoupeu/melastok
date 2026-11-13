import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Button, Card, Screen } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

/**
 * Pantalla para usuarios con sesión pero sin perfil aprobado (activo == false)
 * o cuyo perfil no se pudo cargar. No tienen acceso a ninguna pestaña.
 */
export default function PendingScreen() {
  const { user, profile, profileError, signOut, retryProfile } = useAuth();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await signOut();
    setLeaving(false);
  };

  const errorMode = !!profileError && !profile;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Logo size={72} showName={false} />
        <Card style={styles.card}>
          <View style={[styles.icon, errorMode && { backgroundColor: Colors.dangerSoft }]}>
            <Ionicons name={errorMode ? 'cloud-offline-outline' : 'hourglass-outline'} size={34} color={errorMode ? Colors.danger : Colors.warning} />
          </View>
          <Text style={styles.title}>{errorMode ? 'No se pudo cargar tu perfil' : 'Tu cuenta está pendiente de aprobación'}</Text>
          <Text style={styles.text}>
            {errorMode
              ? profileError
              : 'Un administrador debe aprobar tu cuenta desde "Gestionar usuarios" antes de que puedas usar MelaStock. Cuando lo haga, la app se desbloqueará automáticamente.'}
          </Text>
          {user?.email ? <Text style={styles.email}>{user.email}</Text> : null}
          {errorMode ? <Button title="Reintentar" icon="refresh" variant="secondary" onPress={retryProfile} /> : null}
          <Button title="Cerrar sesión" icon="log-out-outline" variant="ghost" onPress={logout} loading={leaving} />
        </Card>
        <Text style={styles.footer}>Desarrollado por GAMA Studio</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.xl, justifyContent: 'center', alignItems: 'center', gap: Spacing.xl },
  card: { alignSelf: 'stretch', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  icon: { width: 68, height: 68, borderRadius: 34, backgroundColor: Colors.warningSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  text: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  email: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  footer: { fontSize: FontSize.xs, color: Colors.textMuted },
});
