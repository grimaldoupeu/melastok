import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage, supabase } from '@/lib/supabase';

type QueryState<T> = {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

type Options = {
  /** Vuelve a consultar cada vez que la pantalla recibe el foco */
  refetchOnFocus?: boolean;
  /** Tablas de Supabase a escuchar en tiempo real; cualquier cambio dispara refetch */
  realtimeTables?: string[];
  enabled?: boolean;
};

/**
 * Hook mínimo para consultas a Supabase con recarga por foco, pull-to-refresh
 * y suscripción realtime opcional.
 */
export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  { refetchOnFocus = true, realtimeTables = [], enabled = true }: Options = {}
) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const requestId = useRef(0);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent' = 'silent') => {
      if (!enabled) return;
      const id = ++requestId.current;
      setState((s) => ({
        ...s,
        loading: mode === 'initial' ? true : s.loading && s.data === null,
        refreshing: mode === 'refresh',
        error: mode === 'silent' ? s.error : null,
      }));
      try {
        const data = await fetcherRef.current();
        if (id !== requestId.current) return;
        setState({ data, loading: false, refreshing: false, error: null });
      } catch (err) {
        if (id !== requestId.current) return;
        setState((s) => ({ ...s, loading: false, refreshing: false, error: errorMessage(err) }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, ...deps]
  );

  // Carga inicial y cuando cambian las dependencias
  useEffect(() => {
    run(state.data === null ? 'initial' : 'silent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Recarga al enfocar la pantalla
  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) run('silent');
    }, [refetchOnFocus, run])
  );

  // Realtime
  const tablesKey = realtimeTables.join(',');
  useEffect(() => {
    if (!tablesKey) return;
    const channel = supabase.channel(`rt-${tablesKey}-${Math.random().toString(36).slice(2)}`);
    for (const table of tablesKey.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => run('silent'));
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tablesKey, run]);

  return {
    ...state,
    refetch: () => run('silent'),
    refresh: () => run('refresh'),
  };
}
