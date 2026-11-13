/**
 * Firebase para web (navegador). En Android / iOS Metro usa firebase.native.ts.
 * La sesión de Auth se persiste en localStorage del navegador.
 */
import { type Auth, browserLocalPersistence, getAuth, initializeAuth } from 'firebase/auth';

import { app } from '@/lib/firebase-core';

export { app, db, firebaseConfig, firebaseErrorMessage, isFirebaseConfigured } from '@/lib/firebase-core';

function createWebAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: browserLocalPersistence });
  } catch {
    // Ya inicializado (recarga en caliente): reutilizar la instancia existente
    return getAuth(app);
  }
}

export const auth: Auth = createWebAuth();
