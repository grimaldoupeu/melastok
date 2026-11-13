import { useCallback, useEffect, useState } from 'react';

import { firebaseErrorMessage } from '@/lib/firebase';

/**
 * Carga asíncrona (una vez por cada combinación de `deps`), para consultas que
 * no necesitan tiempo real, como las ventas de un periodo en Reportes.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelado = false;
    fn().then(
      (data) => !cancelado && setState({ key: `${key}#${intento}`, data, error: null }),
      (e) => !cancelado && setState({ key: `${key}#${intento}`, data: null, error: firebaseErrorMessage(e) })
    );
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, intento, enabled]);

  const vigente = state.key === `${key}#${intento}`;
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return {
    data: vigente ? state.data : null,
    error: vigente ? state.error : null,
    loading: enabled && !vigente,
    reintentar,
  };
}
