import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { firebaseErrorMessage } from '@/lib/firebase';
import { cerrarSesion, iniciarSesion, observarSesion, type User } from '@/services/auth';
import { asegurarPerfil, observarPerfil } from '@/services/perfiles';
import type { Perfil } from '@/types/db';

type AuthContextValue = {
  user: User | null;
  profile: Perfil | null;
  /** Error al cargar el perfil (sin red o sin permisos) */
  profileError: string | null;
  loading: boolean;
  /** Sesión iniciada y perfil aprobado por el admin */
  isActive: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  retryProfile: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Perfil | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // Sesión de Firebase Auth
  useEffect(() => {
    const unsubscribe = observarSesion((u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setProfileError(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Perfil en tiempo real (rol / activo). Si no existe, se crea como vendedor pendiente.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const nombre = user.displayName || user.email?.split('@')[0] || 'Usuario';

    asegurarPerfil(user.uid, nombre, user.email ?? '')
      .then((inicial) => {
        if (cancelled) return;
        setProfile(inicial);
        setProfileError(null);
        setLoading(false);
        unsubscribe = observarPerfil(
          user.uid,
          (p) => {
            if (!cancelled && p) setProfile(p);
          },
          () => undefined
        );
      })
      .catch((e) => {
        if (cancelled) return;
        // Sin acceso al perfil (sin red o reglas): no se concede acceso a la app.
        setProfile(null);
        setProfileError(firebaseErrorMessage(e, 'No se pudo cargar tu perfil'));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user, attempt]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await iniciarSesion(email, password);
      return null;
    } catch (e) {
      return firebaseErrorMessage(e);
    }
  }, []);

  const signOut = useCallback(async () => {
    await cerrarSesion();
  }, []);

  const retryProfile = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      profileError,
      loading,
      isActive: !!user && profile?.activo === true,
      isAdmin: profile?.activo === true && profile.rol === 'admin',
      signIn,
      signOut,
      retryProfile,
    }),
    [user, profile, profileError, loading, signIn, signOut, retryProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
