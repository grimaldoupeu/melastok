/**
 * Parte compartida de la inicialización de Firebase (todas las plataformas):
 * configuración, app, Firestore y traducción de errores.
 *
 * La instancia de Auth se crea por plataforma:
 *   - src/lib/firebase.native.ts  (Android / iOS: persistencia en AsyncStorage)
 *   - src/lib/firebase.ts         (web: persistencia en localStorage)
 * Importa siempre desde '@/lib/firebase'; Metro elige el archivo correcto.
 */
import { type FirebaseApp, type FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { type Firestore, getFirestore } from 'firebase/firestore';

export const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

/** true cuando el .env tiene las credenciales mínimas de Firebase */
export const isFirebaseConfigured = (firebaseConfig.apiKey ?? '').length > 10 && (firebaseConfig.projectId ?? '').length > 0;

function createApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp(
    isFirebaseConfigured
      ? firebaseConfig
      : { ...firebaseConfig, apiKey: 'sin-configurar', projectId: 'sin-configurar', appId: '1:0:web:0' }
  );
}

export const app: FirebaseApp = createApp();

export const db: Firestore = getFirestore(app);

/** Convierte errores de Firebase (Auth / Firestore) en mensajes en español */
export function firebaseErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  const message = typeof err === 'object' && err !== null && 'message' in err ? String((err as { message: unknown }).message) : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'Correo o contraseña incorrectos';
    case 'auth/invalid-email':
      return 'El correo no es válido';
    case 'auth/user-disabled':
      return 'Este usuario está desactivado';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet.';
    case 'auth/email-already-in-use':
      return 'Ya existe un usuario con ese correo';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres';
    case 'auth/requires-recent-login':
      return 'Por seguridad, vuelve a iniciar sesión para hacer este cambio';
    case 'permission-denied':
      return 'No tienes permisos para esta acción';
    case 'unavailable':
      return 'Servicio no disponible. Revisa tu conexión.';
    case 'not-found':
      return 'El registro no existe';
    case 'aborted':
    case 'failed-precondition':
      return 'La operación fue interrumpida por otro cambio. Inténtalo de nuevo.';
    default:
      break;
  }
  if (/Network request failed/i.test(message)) return 'Sin conexión. Revisa tu internet.';
  // Errores lanzados por nuestras transacciones (throw new Error('...'))
  if (message && !code) return message;
  return message || fallback;
}
