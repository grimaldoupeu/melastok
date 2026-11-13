import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** true cuando el archivo .env tiene las credenciales de Supabase */
export const isSupabaseConfigured = /^https?:\/\//.test(url) && anonKey.length > 20;

export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey : 'placeholder-anon-key',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Refresca el token solo mientras la app está en primer plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

/** Convierte cualquier error (PostgrestError, Error, string) en un mensaje legible. */
export function errorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = String((err as { message: unknown }).message);
    if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
    if (/Email not confirmed/i.test(msg)) return 'El correo aún no ha sido confirmado';
    if (/Network request failed|Failed to fetch/i.test(msg)) return 'Sin conexión. Revisa tu internet.';
    if (/row-level security/i.test(msg)) return 'No tienes permisos para esta acción';
    return msg;
  }
  return fallback;
}
