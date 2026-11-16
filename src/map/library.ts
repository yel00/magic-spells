// Reads the listener's own music out of Spotify — what they play most, who they
// follow, what they've liked, and their own playlists — and reduces it to a
// ranked list of artists for the library map.
import { norm } from '../enrich/text';
import * as api from '../spotify/api';
import type { Artist, Paging, Track } from '../spotify/types';

export interface LibraryArtist {
  name: string;
  /** Relative weight in the listener's library; the heaviest is 1. */
  weight: number;
  /** Names of the listener's playlists this artist appears in. */
  playlists: string[];
}

export interface LibraryInput {
  /** Most-played artists for recent, medium and long time ranges, each most-played first. */
  top: string[][];
  followed: string[];
  /** One entry per liked song: its artist. */
  liked: string[];
  playlists: { name: string; artists: string[] }[];
}

const TOP_WEIGHT = [3, 2.5, 2];

/** Combine the signals into one weight per artist. Heavy recent play counts most; a single liked song counts a little. */
export function scoreLibrary(input: LibraryInput, excludedArtists: Set<string> = new Set()): LibraryArtist[] {
  const found = new Map<string, { name: string; score: number; playlists: Set<string> }>();
  const at = (name: string) => found.get(norm(name)) || found.set(norm(name), { name, score: 0, playlists: new Set() }).get(norm(name))!;
  input.top.forEach((list, range) => list.forEach((name, i) => name && (at(name).score += (TOP_WEIGHT[range] ?? 1.5) * (1 - i / (list.length + 5)))));
  input.followed.forEach((name) => name && (at(name).score += 1));
  const capped = (names: string[], each: number, cap: number, mark?: string) => {
    const counts = new Map<string, number>();
    names.forEach((n) => n && counts.set(n, (counts.get(n) || 0) + 1));
    for (const [name, count] of counts) {
      const a = at(name);
      a.score += Math.min(count * each, cap);
      if (mark) a.playlists.add(mark);
    }
  };
  capped(input.liked, 0.2, 2);
  input.playlists.forEach((p) => capped(p.artists, 0.12, 1.2, p.name));
  const all = [...found.values()].filter((a) => norm(a.name) && !excludedArtists.has(norm(a.name))).sort((a, b) => b.score - a.score);
  const max = all[0]?.score || 1;
  return all.map((a) => ({ name: a.name, weight: Math.round((a.score / max) * 1000) / 1000, playlists: [...a.playlists] }));
}

async function pages<T>(first: Promise<Paging<T>>, max: number): Promise<T[]> {
  const out: T[] = [];
  let page: Paging<T> | null = await first;
  for (let i = 0; page && i < max; i++) {
    out.push(...page.items);
    if (!page.next) break;
    const raw: any = await api.nextPage<T>(page.next);
    page = raw.artists ?? raw;
  }
  return out;
}

export async function gatherLibrary(
  onStep: (label: string) => void,
  exclude: { playlists: string[]; artists: { key: string }[] } = { playlists: [], artists: [] },
): Promise<{ artists: LibraryArtist[]; playlists: string[]; ownedPlaylists: string[] }> {
  onStep('Reading what you play most…');
  const top = await Promise.all((['short_term', 'medium_term', 'long_term'] as const).map((r) => api.topArtistsRange(r).then((p) => p.items.map((a) => a.name)).catch(() => [] as string[])));
  onStep('Reading who you follow…');
  const followed = await pages<Artist>(api.followedArtists(), 6).then((a) => a.map((x) => x.name)).catch(() => []);
  onStep('Reading your liked songs…');
  const liked = await pages<{ track: Track }>(api.savedTracks(), 6).then((t) => t.map((x) => x.track?.artists?.[0]?.name).filter(Boolean)).catch(() => []);
  onStep('Reading your playlists…');
  const me = await api.me().catch(() => null);
  const lists = await pages(api.myPlaylists(), 3).catch(() => []);
  // Spotify only shares track lists for playlists the listener owns or collaborates on.
  const owned = lists.filter((p) => p && (p.owner?.id === me?.id || p.collaborative)).sort((a, b) => (api.playlistCount(b) ?? 0) - (api.playlistCount(a) ?? 0));
  // The twelve largest playlists that haven't been left out.
  const own = owned.filter((p) => !exclude.playlists.includes(p.name)).slice(0, 12);
  const playlists: { name: string; artists: string[] }[] = [];
  for (const p of own) {
    const items = await pages(api.playlistItems(p.id), 2).catch(() => []);
    const artists = items.map((e) => api.entryTrack(e)?.artists?.[0]?.name).filter((n): n is string => !!n);
    if (artists.length) playlists.push({ name: p.name, artists });
  }
  return {
    artists: scoreLibrary({ top, followed, liked, playlists }, new Set(exclude.artists.map((a) => a.key))),
    playlists: playlists.map((p) => p.name),
    ownedPlaylists: owned.map((p) => p.name),
  };
}
