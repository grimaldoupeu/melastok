import { useEffect, useState } from 'react';

import { firebaseErrorMessage } from '@/lib/firebase';

type Unsubscribe = () => void;
type Subscribe<T> = (onData: (data: T) => void, onError: (e: unknown) => void) => Unsubscribe;

/**
 * Suscripción en tiempo real a Firestore (onSnapshot) a través de un servicio.
 * `subscribe` recibe los callbacks y devuelve la función para cancelar.
 * Cambia `deps` para volver a suscribirse con otros parámetros.
 */
export function useRealtime<T>(subscribe: Subscribe<T>, deps: unknown[] = [], enabled = true) {
  const [state, setState] = useState<{ data: T | null; error: string | null; key: string }>({ data: null, error: null, key: '' });
  const key = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribe(
      (data) => setState({ data, error: null, key }),
      (e) => setState((s) => ({ ...s, error: firebaseErrorMessage(e), key }))
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  // Mientras cambian las deps, los datos anteriores cuentan como "cargando"
  const stale = state.key !== key;
  return {
    data: stale ? null : state.data,
    error: stale ? null : state.error,
    loading: enabled && (stale || (state.data === null && state.error === null)),
  };
}
