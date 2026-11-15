// Small persistent cache. Biographies and credits barely change, so once a
// page has been looked up it opens instantly for weeks and costs the free
// data sources nothing.

const PREFIX = 'ms.c3:';
const DAY = 86_400_000;
export const TTL = { long: 30 * DAY, miss: 2 * DAY };

interface Entry<T> {
  v: T;
  exp: number;
}

const inflight = new Map<string, Promise<unknown>>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): Entry<T> | null {
  try {
    const raw = storage()?.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    return entry.exp > Date.now() ? entry : null;
  } catch {
    return null;
  }
}

function prune(s: Storage) {
  // Out of room: drop the half of our entries that expire soonest.
  const ours: [string, number][] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    try {
      ours.push([k, JSON.parse(s.getItem(k)!).exp || 0]);
    } catch {
      ours.push([k, 0]);
    }
  }
  ours.sort((a, b) => a[1] - b[1]);
  ours.slice(0, Math.ceil(ours.length / 2)).forEach(([k]) => s.removeItem(k));
}

function write<T>(key: string, value: T, ttl: number) {
  const s = storage();
  if (!s) return;
  const raw = JSON.stringify({ v: value, exp: Date.now() + ttl });
  try {
    s.setItem(PREFIX + key, raw);
  } catch {
    try {
      prune(s);
      s.setItem(PREFIX + key, raw);
    } catch {
      /* still full: carry on uncached */
    }
  }
}

/**
 * Thrown by a lookup that got an answer it doesn't trust to be complete (a
 * source was down or rate-limiting). The value is used now but not remembered,
 * so the next visit tries again instead of showing a gap for days.
 */
export class Provisional<T> extends Error {
  constructor(public value: T) {
    super('provisional');
  }
}

/** Look something up once; remember hits for a month and misses for two days (or `ttl` for both). Errors are not remembered. */
export function cached<T>(key: string, fn: () => Promise<T | null>, ttl?: number): Promise<T | null> {
  const hit = read<T | null>(key);
  if (hit) return Promise.resolve(hit.v);
  const running = inflight.get(key) as Promise<T | null> | undefined;
  if (running) return running;
  const p = fn()
    .then(
      (v) => {
        write(key, v, ttl ?? (v === null ? TTL.miss : TTL.long));
        return v;
      },
      (e) => {
        if (e instanceof Provisional) return e.value as T | null;
        throw e;
      },
    )
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
