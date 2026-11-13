/**
 * Servicio de autenticación (Firebase Auth, email y contraseña).
 */
import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';

import { auth, firebaseConfig } from '@/lib/firebase';
import { crearPerfil } from '@/services/perfiles';
import type { Rol } from '@/types/db';

export type { User };

export function iniciarSesion(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
}

export function cerrarSesion() {
  return fbSignOut(auth);
}

export function observarSesion(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export function usuarioActual(): User | null {
  return auth.currentUser;
}

export async function cambiarContrasena(nueva: string) {
  if (!auth.currentUser) throw new Error('No has iniciado sesión');
  await updatePassword(auth.currentUser, nueva);
}

/**
 * Crea un usuario (solo admin) sin cerrar la sesión actual.
 * Usa una segunda instancia de Firebase App con persistencia en memoria,
 * de modo que el nuevo usuario no reemplaza al admin que está logueado.
 */
export async function crearUsuario(input: { email: string; password: string; nombre: string; rol: Rol }): Promise<string> {
  const name = 'melastock-secundaria';
  const secondaryApp = getApps().find((a) => a.name === name) ?? initializeApp(firebaseConfig, name);
  const secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, input.email.trim().toLowerCase(), input.password);
    await updateProfile(cred.user, { displayName: input.nombre.trim() });
    // El perfil se escribe con la sesión del admin (reglas: solo admin crea perfiles de otros)
    await crearPerfil(cred.user.uid, {
      nombre: input.nombre.trim(),
      email: input.email.trim().toLowerCase(),
      rol: input.rol,
      activo: true,
    });
    return cred.user.uid;
  } finally {
    await fbSignOut(secondaryAuth).catch(() => undefined);
  }
}
