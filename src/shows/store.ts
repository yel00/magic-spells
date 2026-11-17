// The shows you've marked as ones you were at. Kept on this device.
import { createStore } from '../lib/store';
import { isDemo } from '../spotify/auth';
import type { ShowSummary } from './types';

export const myShows = createStore<{ shows: ShowSummary[] }>({ shows: [] });

let key = '';

export function openShows(userId: string) {
  key = `ms.shows:${isDemo() ? 'demo' : userId}`;
  try {
    myShows.set({ shows: JSON.parse(localStorage.getItem(key) || '[]') as ShowSummary[] });
  } catch {
    myShows.set({ shows: [] });
  }
}

function commit(shows: ShowSummary[]) {
  myShows.set({ shows });
  try {
    localStorage.setItem(key, JSON.stringify(shows));
  } catch {
    /* storage unavailable: kept for this session only */
  }
}

export const wasThere = (id: string) => myShows.get().shows.some((s) => s.id === id);

export function markShow(show: ShowSummary) {
  if (wasThere(show.id)) return;
  // Songs are fetched again when the show is opened; only the summary is kept.
  const { sets: _sets, ...rest } = show as ShowSummary & { sets?: unknown };
  commit([...myShows.get().shows, rest]);
}

export function unmarkShow(id: string) {
  commit(myShows.get().shows.filter((s) => s.id !== id));
}
