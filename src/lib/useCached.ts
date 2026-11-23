import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Data that a page can show on its very first render.
 *
 * `useAsync` always starts with a loading state. Pages that are also published as static HTML
 * (see seo/prerender.ts) must not replace that HTML with a spinner when the app starts, so they
 * read through this hook instead: a value that is already known (embedded in the page by the
 * build, or fetched earlier in this visit) is returned immediately and refreshed in the
 * background when it is older than `ttl`. A failed refresh keeps the known value on screen.
 */
interface Entry {
  /** 0 = embedded at build time: always refreshed. */
  at: number;
  data: unknown;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const store = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

interface Options<T> {
  /** A value known without a request (for example from the page's embedded data), or undefined. */
  seed?: () => T | undefined;
  ttl?: number;
}

function known(key: string, seed?: () => unknown): Entry | undefined {
  const existing = store.get(key);
  if (existing) return existing;
  const seeded = seed?.();
  if (seeded === undefined) return undefined;
  const entry = { at: 0, data: seeded };
  store.set(key, entry);
  return entry;
}

function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = pending.get(key);
  if (running) return running as Promise<T>;
  const request = fetcher()
    .then((data) => {
      store.set(key, { at: Date.now(), data });
      return data;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function useCached<T>(key: string, fetcher: () => Promise<T>, options: Options<T> = {}) {
  const { seed, ttl = DEFAULT_TTL_MS } = options;
  // The entry is kept together with its key, so a value for a previous key is never shown for a new one.
  const [state, setState] = useState<{ key: string; entry?: Entry; error?: unknown }>(() => ({ key, entry: known(key, seed) }));
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seedRef = useRef(seed);
  seedRef.current = seed;

  const refresh = useCallback(
    async (force: boolean) => {
      const entry = known(key, seedRef.current);
      setState((prev) => (prev.key === key && prev.entry === entry && !prev.error ? prev : { key, entry }));
      if (!force && entry && Date.now() - entry.at < ttl) return;
      try {
        await load(key, () => fetcherRef.current());
        setState((prev) => (prev.key === key ? { key, entry: store.get(key) } : prev));
      } catch (error) {
        console.error(error);
        // A value that is already on screen stays; only an empty page shows the error.
        setState((prev) => (prev.key === key && !prev.entry ? { key, error } : prev));
      }
    },
    [key, ttl],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const current = state.key === key ? state : { key, entry: known(key, seed) };
  return {
    data: current.entry ? (current.entry.data as T) : null,
    /** True only while there is nothing to show yet. */
    loading: !current.entry && !current.error,
    error: current.entry ? null : (current.error ?? null),
    reload: useCallback(() => refresh(true), [refresh]),
  };
}
