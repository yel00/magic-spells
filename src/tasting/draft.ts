// The songs lined up for the next tasting. Kept apart from the tasting screen
// so a song can be added from anywhere (a song's About sheet, a track's menu)
// and still be waiting when the tasting screen is opened.
import { createStore } from '../lib/store';
import { isDemo } from '../spotify/auth';
import type { Track } from '../spotify/types';

export const MAX_SEEDS = 6;

const KEY = () => `ms.tasting:draft${isDemo() ? ':demo' : ''}`;

function load(): Track[] {
  try {
    return JSON.parse(localStorage.getItem(KEY()) || '[]');
  } catch {
    return [];
  }
}

export const draft = createStore<{ picked: Track[] }>({ picked: load() });

function set(picked: Track[]) {
  draft.set({ picked });
  try {
    localStorage.setItem(KEY(), JSON.stringify(picked));
  } catch {
    /* storage unavailable: the list lasts until the app is closed */
  }
}

/** Only what the tasting needs, so a long list of fields isn't stored for each song. */
function slim(t: Track): Track {
  return {
    id: t.id, name: t.name, uri: t.uri, duration_ms: t.duration_ms,
    artists: t.artists.map((a) => ({ id: a.id, name: a.name, uri: a.uri })),
    album: t.album && { id: t.album.id, name: t.album.name, uri: t.album.uri, images: (t.album.images || []).slice(-2), artists: [], release_date: t.album.release_date },
  };
}

export const inDraft = (uri: string) => draft.get().picked.some((p) => p.uri === uri);

/** Add a song. Returns 'added', 'already' if it was there, or 'full' if the list has reached its limit. */
export function addToDraft(t: Track): 'added' | 'already' | 'full' {
  const cur = draft.get().picked;
  if (cur.some((p) => p.uri === t.uri)) return 'already';
  if (cur.length >= MAX_SEEDS) return 'full';
  set([...cur, slim(t)]);
  return 'added';
}

export function removeFromDraft(uri: string) {
  set(draft.get().picked.filter((p) => p.uri !== uri));
}

export function toggleDraft(t: Track) {
  if (inDraft(t.uri)) removeFromDraft(t.uri);
  else addToDraft(t);
}

export const clearDraft = () => set([]);
