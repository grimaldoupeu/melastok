import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { firebaseErrorMessage } from '@/lib/firebase';
import { cerrarSesion, iniciarSesion, observarSesion, type User } from '@/services/auth';
import { asegurarPerfil, observarPerfil } from '@/services/perfiles';
import type { Perfil } from '@/types/db';

type AuthContextValue = {
  user: User | null;
  profile: Perfil | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Perfil | null>(null);
  const [loading, setLoading] = useState(true);

  // Sesión de Firebase Auth
  useEffect(() => {
    const unsubscribe = observarSesion((u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Perfil en tiempo real (rol / activo). Si no existe, se crea como vendedor.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const nombre = user.displayName || user.email?.split('@')[0] || 'Usuario';

    asegurarPerfil(user.uid, nombre, user.email ?? '')
      .then((inicial) => {
        if (cancelled) return;
        setProfile(inicial);
        setLoading(false);
        unsubscribe = observarPerfil(
          user.uid,
          (p) => {
            if (cancelled) return;
            if (p && p.activo === false) {
              // Usuario desactivado por el admin: cerrar sesión
              cerrarSesion().catch(() => undefined);
              return;
            }
            if (p) setProfile(p);
          },
          () => undefined
        );
      })
      .catch(() => {
        if (cancelled) return;
        // Sin acceso a Firestore (reglas o red): sesión mínima como vendedor
        setProfile({ id: user.uid, nombre, email: user.email ?? '', rol: 'vendedor', activo: true, creadoEn: null });
        setLoading(false);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user]);

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

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, isAdmin: profile?.rol === 'admin', signIn, signOut }),
    [user, profile, loading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
