import { getAccessToken, isDemo } from './auth';
import { demoRequest } from './demo';
import type {
  Album,
  AlbumRef,
  Artist,
  Device,
  Me,
  Paging,
  PlaybackState,
  PlayHistory,
  Playlist,
  PlaylistEntry,
  Queue,
  SearchResult,
  Track,
} from './types';

const BASE = 'https://api.spotify.com/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined>;

interface Options {
  query?: Query;
  body?: unknown;
}

export async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : BASE + path);
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  if (isDemo()) return demoRequest(method, url, opts.body) as T;

  let forceRefresh = false;
  for (let attempt = 0; ; attempt++) {
    const token = await getAccessToken(forceRefresh);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (res.status === 401 && attempt === 0) {
      forceRefresh = true;
      continue;
    }
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(Number(res.headers.get('Retry-After')) || 1, 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* some player endpoints answer with a bare string */
    }
    if (!res.ok) {
      throw new ApiError(res.status, json?.error?.message || `Spotify error ${res.status}`, json?.error?.reason);
    }
    return json as T;
  }
}

const get = <T>(path: string, query?: Query) => request<T>('GET', path, { query });

/**
 * A list request that survives Spotify lowering a page-size cap. Spotify has
 * been cutting the maximum `limit` on endpoints for personal apps (search and
 * artist albums are already down to 10) and rejects anything larger outright,
 * so if a bigger page is refused, ask again for 10. Paging still reaches the rest.
 */
async function getList<T>(path: string, query: Query): Promise<T> {
  try {
    return await get<T>(path, query);
  } catch (e) {
    if (e instanceof ApiError && e.status === 400 && /limit/i.test(e.message) && Number(query.limit) > 10) return get<T>(path, { ...query, limit: 10 });
    throw e;
  }
}

/** Fetch the next page of any list Spotify returned. */
export const nextPage = <T>(url: string) => get<Paging<T>>(url);

// ---- Player -----------------------------------------------------------------

export const getPlayback = () => get<PlaybackState | null>('/me/player');

export const getDevices = () => get<{ devices: Device[] }>('/me/player/devices').then((r) => r.devices);

export const transfer = (deviceId: string, play?: boolean) =>
  request<null>('PUT', '/me/player', { body: { device_ids: [deviceId], ...(play !== undefined ? { play } : {}) } });

export interface PlayOptions {
  deviceId?: string;
  contextUri?: string;
  uris?: string[];
  offsetUri?: string;
  offsetPosition?: number;
}

export function play(o: PlayOptions = {}) {
  const body: Record<string, unknown> = {};
  if (o.contextUri) body.context_uri = o.contextUri;
  if (o.uris) body.uris = o.uris;
  if (o.offsetUri) body.offset = { uri: o.offsetUri };
  else if (o.offsetPosition !== undefined) body.offset = { position: o.offsetPosition };
  return request<null>('PUT', '/me/player/play', {
    query: { device_id: o.deviceId },
    body: Object.keys(body).length ? body : undefined,
  });
}

export const pause = () => request<null>('PUT', '/me/player/pause');
export const next = () => request<null>('POST', '/me/player/next');
export const previous = () => request<null>('POST', '/me/player/previous');
export const seek = (ms: number) => request<null>('PUT', '/me/player/seek', { query: { position_ms: Math.round(ms) } });
export const setVolume = (pct: number, deviceId?: string) =>
  request<null>('PUT', '/me/player/volume', { query: { volume_percent: Math.round(pct), device_id: deviceId } });
export const setShuffle = (on: boolean) => request<null>('PUT', '/me/player/shuffle', { query: { state: on } });
export const setRepeat = (mode: 'off' | 'track' | 'context') =>
  request<null>('PUT', '/me/player/repeat', { query: { state: mode } });
export const getQueue = () => get<Queue>('/me/player/queue');
export const addToQueue = (uri: string) => request<null>('POST', '/me/player/queue', { query: { uri } });
export const recentlyPlayed = () => getList<Paging<PlayHistory>>('/me/player/recently-played', { limit: 50 });

// ---- Library ----------------------------------------------------------------

export const me = () => get<Me>('/me');
export const myPlaylists = () => getList<Paging<Playlist>>('/me/playlists', { limit: 50 });
export const savedAlbums = () => getList<Paging<{ album: AlbumRef }>>('/me/albums', { limit: 50 });
export const savedTracks = () => getList<Paging<{ track: Track }>>('/me/tracks', { limit: 50 });
export const followedArtists = () =>
  getList<{ artists: Paging<Artist> }>('/me/following', { type: 'artist', limit: 50 }).then((r) => r.artists);
export const topArtists = () => getList<Paging<Artist>>('/me/top/artists', { limit: 20, time_range: 'medium_term' });
export const topArtistsRange = (range: 'short_term' | 'medium_term' | 'long_term') =>
  getList<Paging<Artist>>('/me/top/artists', { limit: 50, time_range: range });
export const topTracks = () => getList<Paging<Track>>('/me/top/tracks', { limit: 20, time_range: 'short_term' });

export const saveToLibrary = (uris: string[]) => request<null>('PUT', '/me/library', { body: { uris } });
export const removeFromLibrary = (uris: string[]) => request<null>('DELETE', '/me/library', { body: { uris } });
export const libraryContains = (uris: string[]) =>
  get<boolean[]>('/me/library/contains', { uris: uris.join(',') }).catch(() => uris.map(() => false));

// ---- Catalog ----------------------------------------------------------------

export const album = (id: string) => get<Album>(`/albums/${id}`);
export const artist = (id: string) => get<Artist>(`/artists/${id}`);
/** Spotify returns an artist's releases ten at a time. */
const ALBUM_PAGE = 10;

async function releases(id: string, group: 'album' | 'single', pages: number): Promise<{ items: AlbumRef[]; more: boolean }> {
  const first = await get<Paging<AlbumRef>>(`/artists/${id}/albums`, { include_groups: group, limit: ALBUM_PAGE, offset: 0 });
  const total = first.total ?? first.items.length;
  const wanted = Math.min(pages, Math.ceil(total / ALBUM_PAGE));
  // The first page says how many there are; fetch the rest side by side.
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, wanted - 1) }, (_, i) =>
      get<Paging<AlbumRef>>(`/artists/${id}/albums`, { include_groups: group, limit: ALBUM_PAGE, offset: (i + 1) * ALBUM_PAGE }).catch(() => null),
    ),
  );
  const items = [first, ...rest].flatMap((p) => p?.items || []).filter(Boolean);
  return { items, more: total > wanted * ALBUM_PAGE };
}

/**
 * An artist's albums (up to 40) and singles & EPs (up to 20). They are asked
 * for separately so a long run of singles can't crowd the albums out.
 */
export async function artistAlbums(id: string): Promise<Paging<AlbumRef>> {
  const [albums, singles] = await Promise.all([
    releases(id, 'album', 4),
    releases(id, 'single', 2).catch(() => ({ items: [] as AlbumRef[], more: false })),
  ]);
  const seen = new Set<string>();
  const items = [...albums.items, ...singles.items].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  return { items, next: null, total: items.length };
}
export const playlist = (id: string) => get<Playlist>(`/playlists/${id}`);
export const playlistItems = (id: string) => getList<Paging<PlaylistEntry>>(`/playlists/${id}/items`, { limit: 50 });

// Spotify caps search at 10 results per type for personal apps.
export const search = (q: string) =>
  get<SearchResult>('/search', { q, type: 'track,artist,album,playlist', limit: 10 });

export const searchArtists = (name: string) => get<SearchResult>('/search', { q: `artist:"${name.replace(/"/g, '')}"`, type: 'artist', limit: 5 });
export const searchTracksByArtist = (name: string) =>
  get<SearchResult>('/search', { q: `artist:"${name.replace(/"/g, '')}"`, type: 'track', limit: 10 });

export const searchAlbums = (title: string, artist: string) =>
  get<SearchResult>('/search', { q: `album:"${title.replace(/"/g, '')}"${artist ? ` artist:"${artist.replace(/"/g, '')}"` : ''}`, type: 'album', limit: 10 });

export const searchTrack = (title: string, artist: string) =>
  get<SearchResult>('/search', { q: `track:"${title.replace(/"/g, '')}" artist:"${artist.replace(/"/g, '')}"`, type: 'track', limit: 5 });

/** Tracks with this title by anyone, ten at a time, roughly most popular first. */
export const searchByTitle = (title: string, offset: number) =>
  get<SearchResult>('/search', { q: `track:"${title.replace(/"/g, '')}"`, type: 'track', limit: 10, offset });

/** Everything under a record label (albums) or a genre (artists), ten at a time. */
export const browse = (kind: 'label' | 'genre', name: string, offset: number) =>
  get<SearchResult>('/search', { q: `${kind}:"${name.replace(/"/g, '')}"`, type: kind === 'label' ? 'album' : 'artist', limit: 10, offset });

// ---- Playlists --------------------------------------------------------------

export const createPlaylist = (name: string, description = '') =>
  request<Playlist>('POST', '/me/playlists', { body: { name, description, public: false } });
export const addToPlaylist = (id: string, uris: string[]) =>
  request<unknown>('POST', `/playlists/${id}/items`, { body: { uris } });

export function entryTrack(e: PlaylistEntry): Track | null {
  return e.item ?? e.track ?? null;
}

export function playlistCount(p: Playlist): number | undefined {
  return p.items?.total ?? p.tracks?.total;
}
