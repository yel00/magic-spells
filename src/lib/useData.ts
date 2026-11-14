import { useEffect, useState } from 'react';

interface Entry {
  data?: unknown;
  at: number;
  promise?: Promise<unknown>;
}

const cache = new Map<string, Entry>();
const FRESH_MS = 60_000;

export function invalidate(prefix: string) {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

export interface DataState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Cached fetch: a page shows what it had last time immediately, then refreshes
 * in the background if that copy is older than a minute.
 */
export function useData<T>(key: string | null, fn: () => Promise<T>): DataState<T> {
  const [, bump] = useState(0);
  const [error, setError] = useState<Error>();
  const entry = key ? cache.get(key) : undefined;

  useEffect(() => {
    if (!key) return;
    let live = true;
    const cur = cache.get(key);
    if (cur && cur.data !== undefined && Date.now() - cur.at < FRESH_MS) return;
    const e: Entry = cur || { at: 0 };
    if (!e.promise) {
      e.promise = fn()
        .then((data) => {
          e.data = data;
          e.at = Date.now();
        })
        .finally(() => {
          e.promise = undefined;
        });
      cache.set(key, e);
    }
    setError(undefined);
    e.promise.then(
      () => live && bump((n) => n + 1),
      (err) => live && setError(err instanceof Error ? err : new Error(String(err))),
    );
    return () => {
      live = false;
    };
    // fn is intentionally not a dependency: the key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, entry === undefined]);

  return {
    data: entry?.data as T | undefined,
    error,
    loading: !!key && entry?.data === undefined && !error,
    reload: () => {
      if (key) cache.delete(key);
      bump((n) => n + 1);
    },
  };
}
