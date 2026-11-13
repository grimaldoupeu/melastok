import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Banner, Button, Card, Input, Screen } from '@/components/ui';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { isFirebaseConfigured } from '@/lib/firebase';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={{ marginTop: Spacing.xxl }}>
            <Logo size={96} />
          </View>

          {!isFirebaseConfigured ? (
            <Banner
              tone="danger"
              icon="warning"
              text="Falta configurar Firebase. Copia .env.example a .env y completa las variables EXPO_PUBLIC_FIREBASE_*."
            />
          ) : null}

          <Card style={{ gap: Spacing.lg }}>
            <Text style={styles.title}>Iniciar sesión</Text>
            <Input
              label="Correo electrónico"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />
            <Input
              label="Contraseña"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              right={
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.textMuted} />
                </Pressable>
              }
            />
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <Button title="Ingresar" icon="log-in-outline" onPress={submit} loading={loading} disabled={!canSubmit} size="lg" />
            <Text style={styles.help}>Si no tienes acceso, pide al administrador que cree tu usuario.</Text>
          </Card>

          <Text style={styles.footer}>Desarrollado por GAMA Studio</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: Spacing.xl, gap: Spacing.xl, justifyContent: 'center' },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.dangerSoft,
    padding: Spacing.md,
    borderRadius: 10,
  },
  errorText: { color: Colors.danger, fontWeight: '600', flex: 1, fontSize: FontSize.sm },
  help: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.xs },
  footer: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 'auto' },
});
