/**
 * Firebase para Android / iOS. Metro elige este archivo en lugar de firebase.ts.
 * La sesión de Auth se persiste en AsyncStorage (sobrevive al cierre de la app).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';
import { type Auth, initializeAuth, type Persistence } from 'firebase/auth';

import { app } from '@/lib/firebase-core';

export { app, db, firebaseConfig, firebaseErrorMessage, isFirebaseConfigured } from '@/lib/firebase-core';

// `getReactNativePersistence` existe en la variante React Native del SDK (la que
// Metro resuelve con la condición "react-native"), pero los tipos públicos de
// `firebase/auth` no la declaran; por eso el cast.
const { getReactNativePersistence } = FirebaseAuth as unknown as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
