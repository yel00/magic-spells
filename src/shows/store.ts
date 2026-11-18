// The shows you've marked as ones you were at. Saved on the device the moment
// you mark them, then synced to your other devices through the same server as
// notes. The area you watch for upcoming concerts rides along with it.
import { adoptPlace, concerts, onPlaceChange } from '../concerts/store';
import type { Place } from '../concerts/types';
import { createStore } from '../lib/store';
import { getAccessToken, isDemo } from '../spotify/auth';
import { adopt, live, markSent, mergeShows, type LocalShow, type MarkedShow } from './merge';
import { openPhotos, syncPhotos } from './photos';
import type { ShowSummary } from './types';

interface ShowState {
  /** The shows you were at. */
  shows: ShowSummary[];
  synced: 'device' | 'synced' | 'offline' | 'unconfigured';
}

export const myShows = createStore<ShowState>({ shows: [], synced: 'device' });

let key = '';
let rev = 0;
let all: LocalShow[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;

function persist() {
  try {
    localStorage.setItem(key, JSON.stringify({ rev, shows: all }));
  } catch {
    /* storage unavailable: kept for this session only */
  }
}

function publish(next: LocalShow[]) {
  all = next;
  myShows.set({ shows: live(all) });
  persist();
}

export function openShows(userId: string) {
  key = `ms.shows:${isDemo() ? 'demo' : userId}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    // Before sync existed this was a plain list.
    rev = Array.isArray(saved) ? 0 : saved?.rev || 0;
    all = adopt(Array.isArray(saved) ? saved : saved?.shows, Date.now());
  } catch {
    rev = 0;
    all = [];
  }
  myShows.set({ shows: live(all) });
  openPhotos(isDemo() ? 'demo' : userId);
  syncShows();
}

function commit(next: LocalShow[]) {
  publish(next);
  clearTimeout(timer);
  timer = setTimeout(syncShows, 1200);
}

export const wasThere = (id: string) => all.some((s) => s.id === id && !s.deleted);

export function markShow(show: ShowSummary) {
  if (wasThere(show.id)) return;
  // Songs are fetched again when the show is opened; only the summary is kept.
  const { sets: _sets, ...rest } = show as ShowSummary & { sets?: unknown };
  const entry: LocalShow = { ...rest, updated_at: Date.now(), deleted: false, dirty: true };
  commit([...all.filter((s) => s.id !== show.id), entry]);
}

export function unmarkShow(id: string) {
  commit(all.map((s) => (s.id === id ? { ...s, updated_at: Date.now(), deleted: true, dirty: true } : s)));
}

export function syncShows(): Promise<void> {
  if (!key || isDemo() || myShows.get().synced === 'unconfigured') return Promise.resolve();
  if (running) return running.then(() => (all.some((s) => s.dirty) ? syncShows() : undefined));
  running = (async () => {
    const changes: MarkedShow[] = all.filter((s) => s.dirty).map(({ dirty: _d, ...s }) => s);
    const { place, placeAt } = concerts.get();
    try {
      const res = await fetch('/api/notes?kind=shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ since: rev, changes, place: placeAt ? { value: place, updated_at: placeAt } : undefined }),
      });
      const isJson = res.headers.get('content-type')?.includes('json');
      if (res.status === 501 || !isJson) {
        myShows.set({ synced: 'unconfigured' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { rev: number; shows: MarkedShow[]; place: { value: Place | null; updated_at: number } | null };
      rev = data.rev;
      publish(mergeShows(markSent(all, changes), data.shows));
      myShows.set({ synced: 'synced' });
      if (data.place) adoptPlace(data.place.value, data.place.updated_at);
      void syncPhotos();
    } catch {
      myShows.set({ synced: 'offline' });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// Choosing a different concert area on this device sends it to the others.
onPlaceChange(() => {
  clearTimeout(timer);
  timer = setTimeout(syncShows, 1200);
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncShows();
  });
}
