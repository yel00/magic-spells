// Tasting sessions: asking the guide for a flight, checking each pick against
// Spotify, and keeping past sessions on the device so they can be revisited.
import { mapLimit } from '../discover/mix';
import { createStore } from '../lib/store';
import * as api from '../spotify/api';
import { getAccessToken, isDemo } from '../spotify/auth';
import type { Track } from '../spotify/types';
import { matchPick } from './logic';
import type { Guide, Pour, Seed, Session } from './types';

export const tastings = createStore<{ sessions: Session[] }>({ sessions: [] });

let key = '';

export function openTastings(userId: string) {
  key = `ms.tastings:${isDemo() ? 'demo' : userId}`;
  try {
    tastings.set({ sessions: JSON.parse(localStorage.getItem(key) || '[]') });
  } catch {
    tastings.set({ sessions: [] });
  }
}

function persist() {
  try {
    // Keep the forty most recent; a session is a few kilobytes.
    localStorage.setItem(key, JSON.stringify(tastings.get().sessions.slice(0, 40)));
  } catch {
    /* storage unavailable: sessions last until the app is closed */
  }
}

export function updateSession(id: string, patch: Partial<Session>) {
  tastings.set({ sessions: tastings.get().sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  persist();
}

export function deleteSession(id: string) {
  tastings.set({ sessions: tastings.get().sessions.filter((s) => s.id !== id) });
  persist();
}

export class TastingError extends Error {
  constructor(message: string, public notConfigured = false) {
    super(message);
  }
}

async function askGuide(seeds: Seed[], note: string, count: number): Promise<Guide> {
  let res: Response;
  try {
    res = await fetch('/api/tasting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
      body: JSON.stringify({ seeds, note, count }),
    });
  } catch {
    throw new TastingError('Couldn’t reach the server. Check your connection and try again.');
  }
  const isJson = res.headers.get('content-type')?.includes('json');
  if (res.status === 501 || !isJson) throw new TastingError('Tasting sessions need an AI key on the server, which isn’t set up yet.', true);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new TastingError(data?.error || 'The session couldn’t be run. Please try again.');
  return data as Guide;
}

/** Run a session: ask the guide, find each pick on Spotify, keep the first `count` that exist there. */
export async function runTasting(seeds: Seed[], note: string, count: number, onStep: (label: string) => void): Promise<Session> {
  onStep('Listening for what your songs have in common…');
  const guide = isDemo() ? demoGuide(seeds) : await askGuide(seeds, note, count);
  onStep('Finding the flight on Spotify…');
  const found = await mapLimit(guide.picks, 3, async (pick) => {
    const r = await api.searchTrack(pick.title, pick.artist).catch(() => null);
    const track: Track | null = r ? matchPick(r.tracks?.items || [], pick) : null;
    return track ? ({ ...pick, track } as Pour) : null;
  });
  const pours = found.filter((p): p is Pour => !!p).slice(0, count);
  if (pours.length < 2) throw new TastingError('The guide’s picks couldn’t be found on Spotify this time. Please try again.');
  const session: Session = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(), title: guide.title, summary: guide.summary, shared: guide.shared, seeds, pours, notes: '',
  };
  tastings.set({ sessions: [session, ...tastings.get().sessions] });
  persist();
  return session;
}

/** A canned flight from the demo library, so the screens can be seen without an AI key. */
function demoGuide(seeds: Seed[]): Guide {
  const picks: [string, string, string][] = [['Blue Hour', 'Glass Orchard', 'Ambient'], ['Signal Fire', 'Night Ferry', 'Synthwave'], ['Marigold', 'Odessa Park', 'Soul'], ['Undertow', 'Juniper Vale', 'Alt country'], ['Lanterns', 'Paper Lanterns', 'Indie folk'], ['Driftwood', 'Low Sun Radio', 'Psych rock']];
  return {
    title: 'Slow builds, close voices',
    summary: `An invented example. With an AI key, this is the guide's read on what ${seeds.slice(0, 2).map((s) => `“${s.title}”`).join(' and ')} have in common.`,
    shared: [
      { feature: 'A patient build', description: 'Each song holds back for a long stretch, adding one layer at a time before it opens up.' },
      { feature: 'Voice mixed close', description: 'The singing sits right at the front with little echo, as if in the same room.' },
    ],
    picks: picks.map(([title, artist, genre], i) => ({
      title, artist, genre, year: String(2009 + i * 2), familiarity: i % 2 ? 'deep cut' : 'well known', shares: i % 2 ? 'Voice mixed close' : 'A patient build',
      why: `A made-up reason for a made-up song: it comes from ${genre.toLowerCase()}, far from where you started, but it does the same thing with time and space.`,
      listen_for: ['How long it waits before the drums come in.', 'The moment the second voice joins, about halfway through.'],
    })),
  };
}
