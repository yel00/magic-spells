// Discovery: who sounds like this artist, what are their best-known tracks, and
// mixes built from both. Spotify closed its own recommendation endpoints to new
// apps, so the "who is similar" answer comes from Last.fm (if a key is set) or
// ListenBrainz (no key), and Spotify is only used to find and play the results.
import { artistInfo } from '../enrich';
import { cached, Provisional } from '../enrich/cache';
import { norm, sameName } from '../enrich/text';
import * as api from '../spotify/api';
import { isDemo } from '../spotify/auth';
import type { Artist, Track } from '../spotify/types';
import { assembleMix, mapLimit } from './mix';

export interface SimilarResult {
  source: string;
  names: string[];
  /** How similar each name is, 0–1, in the same order as `names`. Missing on results saved before maps existed. */
  weights?: number[];
}

/** Similarity for the i-th name: the source's own score, or a guess from its rank. */
export function weightAt(r: SimilarResult, i: number): number {
  return r.weights?.[i] ?? Math.max(0.15, 1 - i / Math.max(r.names.length, 1));
}

const LB_ALGORITHM = 'session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30';

async function fromLastfm(name: string): Promise<SimilarResult | null | 'unavailable'> {
  try {
    const res = await fetch(`/api/similar?artist=${encodeURIComponent(name)}`);
    if (!res.headers.get('content-type')?.includes('json')) return 'unavailable';
    if (res.status === 404) return null;
    if (!res.ok) return 'unavailable';
    const data = (await res.json()) as { source: string; artists: { name: string; match?: number }[] };
    return { source: data.source, names: data.artists.map((a) => a.name), weights: data.artists.map((a, i) => a.match ?? Math.max(0.15, 1 - i / data.artists.length)) };
  } catch {
    return 'unavailable';
  }
}

async function fromListenBrainz(name: string): Promise<SimilarResult | null> {
  const info = await artistInfo(name);
  if (!info?.mbid) return null;
  const res = await fetch(`https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${info.mbid}&algorithm=${LB_ALGORITHM}`);
  if (!res.ok) throw new Error(`ListenBrainz ${res.status}`);
  const list = (await res.json()) as { name: string; score: number }[];
  const top = list.sort((a, b) => b.score - a.score).slice(0, 20);
  const max = top[0]?.score || 1;
  // ListenBrainz scores are raw counts; scale them so the closest artist is 1.
  return top.length ? { source: 'ListenBrainz', names: top.map((a) => a.name), weights: top.map((a) => Math.round((a.score / max) * 1000) / 1000) } : null;
}

export function similarArtists(name: string): Promise<SimilarResult | null> {
  if (isDemo()) return demoSimilar(name);
  return cached(`similar2:${norm(name)}`, async () => {
    const lastfm = await fromLastfm(name);
    if (lastfm !== 'unavailable' && lastfm?.names.length) return lastfm;
    try {
      return await fromListenBrainz(name);
    } catch {
      throw new Provisional(null);
    }
  });
}

type SlimArtist = Pick<Artist, 'id' | 'name' | 'uri' | 'images'>;

/** Find an artist on Spotify by exact name. */
export function findOnSpotify(name: string): Promise<SlimArtist | null> {
  return cached(`sp:artist:${isDemo() ? 'demo:' : ''}${norm(name)}`, async () => {
    const r = await api.searchArtists(name);
    const hit = (r.artists?.items || []).find((a) => sameName(a.name, name));
    return hit ? { id: hit.id, name: hit.name, uri: hit.uri, images: (hit.images || []).slice(-2) } : null;
  });
}

/**
 * An artist's best-known tracks. Spotify removed its "top tracks" endpoint for
 * new apps, but a search restricted to the artist comes back roughly in
 * popularity order, which serves the same purpose.
 */
export function popularTracks(name: string): Promise<Track[] | null> {
  return cached(`sp:top:${isDemo() ? 'demo:' : ''}${norm(name)}`, async () => {
    const r = await api.searchTracksByArtist(name);
    const seen = new Set<string>();
    const tracks = (r.tracks?.items || [])
      .filter((t) => t.artists.some((a) => sameName(a.name, name)))
      .filter((t) => {
        const key = norm(t.name.replace(/\s+[-(].*$/, ''));
        return seen.has(key) ? false : (seen.add(key), true);
      })
      .map(slimTrack);
    return tracks.length ? tracks : null;
  });
}

function slimTrack(t: Track): Track {
  return {
    id: t.id, name: t.name, uri: t.uri, duration_ms: t.duration_ms, explicit: t.explicit,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name, uri: a.uri })),
    album: t.album && { id: t.album.id, name: t.album.name, uri: t.album.uri, images: (t.album.images || []).slice(-2), artists: [] },
  };
}

export interface Mix {
  title: string;
  description: string;
  tracks: Track[];
}

/** Build a mix around one artist: their own tracks threaded through tracks by similar artists. */
export async function buildArtistMix(seed: string, onProgress?: (done: number, total: number) => void): Promise<Mix | null> {
  const similar = await similarArtists(seed);
  const names = (similar?.names || []).slice(0, 14);
  if (!names.length) return null;
  let done = 0;
  const total = names.length + 1;
  const tick = () => onProgress?.(++done, total);
  const seedTracks = (await popularTracks(seed).catch(() => null)) || [];
  tick();
  const others = await mapLimit(names, 3, async (n) => {
    const t = await popularTracks(n).catch(() => null);
    tick();
    return t || [];
  });
  const tracks = assembleMix(seedTracks, others);
  if (tracks.length < 5) return null;
  return { title: `${seed} mix`, description: `Made by Magic Spells from artists similar to ${seed} (${similar!.source}).`, tracks };
}

/** A mix of artists the listener doesn't already follow or play heavily, seeded by the ones they do. */
export async function buildSurpriseMix(seeds: string[], known: Set<string>, onProgress?: (done: number, total: number) => void): Promise<Mix | null> {
  const lists = await Promise.all(seeds.slice(0, 4).map((s) => similarArtists(s).catch(() => null)));
  const fresh: string[] = [];
  // Take from each seed in turn so one favourite doesn't dominate.
  for (let i = 0; fresh.length < 15 && i < 20; i++) {
    for (const l of lists) {
      const n = l?.names[i];
      if (n && !known.has(norm(n)) && !fresh.some((f) => sameName(f, n))) fresh.push(n);
    }
  }
  if (fresh.length < 2) return null;
  let done = 0;
  const others = await mapLimit(fresh.slice(0, 15), 3, async (n) => {
    const t = await popularTracks(n).catch(() => null);
    onProgress?.(++done, Math.min(fresh.length, 15));
    return t || [];
  });
  const tracks = assembleMix([], others);
  if (tracks.length < 4) return null;
  return { title: 'New to you', description: `Made by Magic Spells: artists near ${seeds.slice(0, 3).join(', ')} that you don’t follow yet.`, tracks };
}

/** A mix drawn from a given list of artists (used for the map's recommendations). */
export async function buildNamesMix(title: string, description: string, names: string[], onProgress?: (done: number, total: number) => void): Promise<Mix | null> {
  let done = 0;
  const picked = names.slice(0, 18);
  const others = await mapLimit(picked, 3, async (n) => {
    const t = await popularTracks(n).catch(() => null);
    onProgress?.(++done, picked.length);
    return t || [];
  });
  const tracks = assembleMix([], others);
  return tracks.length >= 4 ? { title, description, tracks } : null;
}

// ---- Videos -------------------------------------------------------------------

export interface Video {
  id: string;
  title: string;
  channel: string;
  thumb: string;
}

export class VideosNotConfigured extends Error {}

export function findVideos(query: string): Promise<Video[] | null> {
  if (isDemo()) return Promise.reject(new VideosNotConfigured());
  return cached(`yt:${norm(query)}`, async () => {
    const res = await fetch(`/api/youtube?q=${encodeURIComponent(query)}`);
    if (res.status === 501 || !res.headers.get('content-type')?.includes('json')) throw new VideosNotConfigured();
    if (!res.ok) throw new Error(res.status === 429 ? 'Today’s YouTube search allowance is used up.' : 'YouTube is unavailable right now.');
    const data = (await res.json()) as { videos: Video[] };
    return data.videos.length ? data.videos : null;
  });
}

export const youtubeSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

// ---- Demo ---------------------------------------------------------------------

const DEMO_ARTISTS = ['Paper Lanterns', 'The Slow Tide', 'Marlowe Finch', 'Glass Orchard', 'Juniper Vale', 'Night Ferry', 'Odessa Park', 'Low Sun Radio'];

function demoSimilar(name: string): Promise<SimilarResult> {
  const start = DEMO_ARTISTS.findIndex((a) => sameName(a, name));
  const rotated = [...DEMO_ARTISTS.slice(start + 1), ...DEMO_ARTISTS.slice(0, Math.max(start, 0))];
  return Promise.resolve({ source: 'Demo data', names: rotated.filter((a) => !sameName(a, name)) });
}
