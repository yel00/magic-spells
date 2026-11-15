// The concert scanner: checks whether artists you follow or play a lot have
// shows near a place you choose. It runs when you open the app (at most once
// a day) and marks shows you haven't seen before as new.
import { mapLimit } from '../discover/mix';
import { cached } from '../enrich/cache';
import { norm } from '../enrich/text';
import { createStore } from '../lib/store';
import * as api from '../spotify/api';
import { isDemo } from '../spotify/auth';
import type { Artist, Paging } from '../spotify/types';
import { localDate, mergeConcerts, watchList } from './logic';
import type { Concert, Place } from './types';

export type ScanStatus = 'idle' | 'scanning' | 'done' | 'unconfigured' | 'failed';

interface ConcertState {
  place: Place | null;
  concerts: Concert[];
  /** Ids of shows the listener has already been shown. */
  seen: string[];
  scannedAt: number;
  watching: number;
  status: ScanStatus;
  progress: [number, number];
}

const KEY = () => `ms.concerts${isDemo() ? ':demo' : ''}`;
const DAY = 86_400_000;

function load(): Partial<ConcertState> {
  try {
    return JSON.parse(localStorage.getItem(KEY()) || '{}');
  } catch {
    return {};
  }
}

const saved = load();
export const concerts = createStore<ConcertState>({
  place: saved.place ?? null,
  concerts: saved.concerts ?? [],
  seen: saved.seen ?? [],
  scannedAt: saved.scannedAt ?? 0,
  watching: saved.watching ?? 0,
  status: 'idle',
  progress: [0, 0],
});

function persist() {
  const { place, concerts: list, seen, scannedAt, watching } = concerts.get();
  try {
    localStorage.setItem(KEY(), JSON.stringify({ place, concerts: list, seen, scannedAt, watching }));
  } catch {
    /* storage unavailable: results last for this session only */
  }
}

export function setPlace(place: Place | null) {
  concerts.set({ place, concerts: [], scannedAt: 0, status: 'idle' });
  persist();
  if (place) scan(true);
}

export function markSeen() {
  const s = concerts.get();
  const ids = s.concerts.map((c) => c.id);
  if (ids.every((id) => s.seen.includes(id))) return;
  // Only remember ids that still exist, so the list can't grow without bound.
  concerts.set({ seen: ids });
  persist();
}

export function newCount(s: ConcertState = concerts.get()): number {
  return s.concerts.filter((c) => !s.seen.includes(c.id)).length;
}

class NotConfigured extends Error {}

async function showsFor(artist: string, place: Place): Promise<Omit<Concert, 'artists'>[]> {
  // Round the location (~1 km) so nearby lookups share a cached answer.
  const lat = place.lat.toFixed(2);
  const lon = place.lon.toFixed(2);
  const found = await cached(
    `gig:${norm(artist)}:${lat}:${lon}:${place.radius}`,
    async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(`/api/concerts?artist=${encodeURIComponent(artist)}&lat=${lat}&lon=${lon}&radius=${place.radius}`);
        if (res.status === 501 || !res.headers.get('content-type')?.includes('json')) throw new NotConfigured();
        if (res.status === 429 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        if (!res.ok) throw new Error(`concerts ${res.status}`);
        return ((await res.json()) as { events: Omit<Concert, 'artists'>[] }).events;
      }
    },
    DAY,
  );
  return found || [];
}

async function allFollowed(): Promise<string[]> {
  const names: string[] = [];
  let page: Paging<Artist> | null = await api.followedArtists();
  for (let i = 0; page && i < 6; i++) {
    names.push(...page.items.map((a) => a.name));
    if (!page.next) break;
    const raw: any = await api.nextPage<Artist>(page.next);
    page = raw.artists ?? raw;
  }
  return names;
}

let running: Promise<void> | null = null;

/** Scan now if `force`, otherwise only if the last scan is more than a day old. */
export function scan(force = false): Promise<void> {
  const s = concerts.get();
  if (!s.place) return Promise.resolve();
  if (running) return running;
  if (!force && Date.now() - s.scannedAt < DAY && s.status !== 'failed') return Promise.resolve();
  const place = s.place;
  running = (async () => {
    concerts.set({ status: 'scanning', progress: [0, 0] });
    try {
      const [followed, top] = await Promise.all([allFollowed().catch(() => []), api.topArtists().then((p) => p.items.map((a) => a.name)).catch(() => [])]);
      const artists = watchList(followed, top);
      if (isDemo()) {
        concerts.set({ concerts: demoConcerts(artists), scannedAt: Date.now(), watching: artists.length, status: 'done' });
        persist();
        return;
      }
      let done = 0;
      let failures = 0;
      concerts.set({ progress: [0, artists.length] });
      // Probe once first: if the server has no key there is no point asking 200 times.
      const lists = await mapLimit(artists, 3, async (artist) => {
        let events: Omit<Concert, 'artists'>[] = [];
        try {
          events = await showsFor(artist, place);
        } catch (e) {
          if (e instanceof NotConfigured) throw e;
          failures++;
        }
        concerts.set({ progress: [++done, artists.length] });
        return { artist, events };
      });
      if (concerts.get().place !== place) return; // the place changed mid-scan
      if (artists.length && failures === artists.length) throw new Error('all lookups failed');
      concerts.set({ concerts: mergeConcerts(lists, localDate()), scannedAt: Date.now(), watching: artists.length, status: 'done' });
      persist();
    } catch (e) {
      concerts.set({ status: e instanceof NotConfigured ? 'unconfigured' : 'failed' });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Shows by one artist near the chosen place (for the artist page). */
export async function showsNear(artist: string): Promise<Concert[] | null> {
  const place = concerts.get().place;
  if (!place) return null;
  if (isDemo()) return demoConcerts([artist]);
  try {
    return mergeConcerts([{ artist, events: await showsFor(artist, place) }], localDate());
  } catch {
    return null;
  }
}

// ---- Choosing a place ---------------------------------------------------------

export interface PlaceHit {
  name: string;
  lat: number;
  lon: number;
}

/** City search (Open-Meteo's free geocoder; no key). */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) throw new Error('Place search is unavailable right now. Try again, or use your current location.');
  const data = (await res.json()) as { results?: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }[] };
  return (data.results || []).map((r) => ({
    name: [r.name, r.admin1, r.country_code].filter((v, i, all) => v && all.indexOf(v) === i).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export function currentPosition(): Promise<PlaceHit> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device can’t share its location.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ name: 'My location', lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('Location wasn’t shared. You can type a city instead.')),
      { timeout: 10_000, maximumAge: 3_600_000 },
    );
  });
}

// ---- Demo ---------------------------------------------------------------------

const VENUES = ['The Lantern Room', 'Harbor Hall', 'Cedar Street Theatre', 'The Signal Club'];

function demoConcerts(artists: string[]): Concert[] {
  const start = Date.now();
  return artists.slice(0, 5).filter((_, i) => i !== 3).map((artist, i) => {
    const date = localDate(new Date(start + (9 + i * 17) * DAY));
    return {
      id: `demo-${norm(artist)}`, name: i === 1 ? 'Demo City Summer Stage' : artist, date, time: i === 2 ? undefined : '20:00',
      venue: VENUES[i % VENUES.length], city: 'Demo City', url: 'https://example.com', lineup: i === 1 ? [artist, 'Odessa Park', 'Night Ferry'] : [artist],
      distance: 3 + i * 6, artists: [artist],
    };
  });
}
