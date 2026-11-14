import type { Track } from '../spotify/types';

export function shuffled<T>(items: T[], rng: () => number = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Turn "a few popular tracks from each artist" into a running order: the seed
 * artist opens and reappears through the mix, and no artist plays twice in a row.
 */
export function assembleMix(seed: Track[], others: Track[][], rng: () => number = Math.random, perArtist = 2, size = 30): Track[] {
  const picks = shuffled(others, rng)
    .map((tracks) => shuffled(tracks.slice(0, 6), rng).slice(0, perArtist))
    .filter((p) => p.length);
  const body: Track[] = [];
  for (let round = 0; round < perArtist; round++) {
    for (const p of picks) if (p[round]) body.push(p[round]);
  }
  const seeds = shuffled(seed.slice(0, 6), rng).slice(0, 3);
  const out = body.slice(0, size - seeds.length);
  // Spread the seed artist's tracks evenly, starting with one up front.
  seeds.forEach((t, i) => out.splice(Math.min(out.length, Math.round((i * (out.length + seeds.length)) / seeds.length)), 0, t));
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.uri) ? false : (seen.add(t.uri), true)));
}

/** Run async work a few at a time, so a burst of lookups doesn't trip Spotify's rate limit. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
