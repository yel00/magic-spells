// Turns "who is similar to whom" into the things a map needs: links between
// artists, and recommendations — artists you don't have that sit close to
// several you do.
import { weightAt, type SimilarResult } from '../discover';
import { norm } from '../enrich/text';
import type { MapEdge } from './layout';

export interface SimilarList {
  /** The artist the list belongs to. */
  of: string;
  result: SimilarResult | null;
}

export interface Recommendation {
  name: string;
  /** Combined closeness to the listener's artists. */
  score: number;
  /** Which of the listener's artists it is close to, closest first. */
  because: { name: string; w: number }[];
}

/** Links among a set of artists, from their similar-artist lists. If two artists list each other, the stronger link wins. */
export function edgesAmong(lists: SimilarList[], include: Set<string>): MapEdge[] {
  const best = new Map<string, MapEdge>();
  for (const { of, result } of lists) {
    if (!result || !include.has(norm(of))) continue;
    result.names.forEach((name, i) => {
      const a = norm(of);
      const b = norm(name);
      if (a === b || !include.has(b)) return;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      const w = weightAt(result, i);
      if (!best.has(key) || best.get(key)!.w < w) best.set(key, { a, b, w });
    });
  }
  return [...best.values()];
}

/**
 * Artists the listener doesn't have, ranked by how close they sit to artists
 * the listener does have. Being near two or more of them counts for much more
 * than being near one: that is what makes a recommendation rather than a guess.
 */
export function recommend(lists: SimilarList[], known: Set<string>, max = 30): Recommendation[] {
  const found = new Map<string, Recommendation>();
  for (const { of, result } of lists) {
    if (!result) continue;
    result.names.forEach((name, i) => {
      const key = norm(name);
      if (!key || known.has(key)) return;
      const r = found.get(key) || found.set(key, { name, score: 0, because: [] }).get(key)!;
      if (!r.because.some((b) => norm(b.name) === norm(of))) r.because.push({ name: of, w: weightAt(result, i) });
    });
  }
  for (const r of found.values()) {
    r.because.sort((a, b) => b.w - a.w);
    const sum = r.because.reduce((n, b) => n + b.w, 0);
    r.score = sum * (1 + 0.6 * (r.because.length - 1));
  }
  return [...found.values()]
    .filter((r) => r.because.length >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
