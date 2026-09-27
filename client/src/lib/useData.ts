import { useCallback, useEffect, useState } from 'react';
import { cachedGet } from './api';

interface DataState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** True when this is the copy saved on the phone, not fresh from the server. */
  fromCache: boolean;
  reload: () => void;
}

export function useData<T>(path: string | null): DataState<T> {
  const [state, setState] = useState<Omit<DataState<T>, 'reload'>>({ data: null, error: null, loading: Boolean(path), fromCache: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    cachedGet<T>(path).then(
      ({ data, fromCache }) => live && setState({ data, fromCache, error: null, loading: false }),
      (error) => live && setState((s) => ({ ...s, error, loading: false })),
    );
    return () => {
      live = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
