import { norm } from '../enrich/text';
import type { Concert } from './types';

/** Merge per-artist results: a festival with three of your artists is one show listing all three. */
export function mergeConcerts(lists: { artist: string; events: Omit<Concert, 'artists'>[] }[], today: string): Concert[] {
  const byId = new Map<string, Concert>();
  for (const { artist, events } of lists) {
    for (const e of events) {
      if (e.date < today) continue;
      const have = byId.get(e.id);
      if (have) {
        if (!have.artists.includes(artist)) have.artists.push(artist);
      } else byId.set(e.id, { ...e, artists: [artist] });
    }
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
}

/** Followed artists first, then most-played, without duplicates. */
export function watchList(followed: string[], top: string[], max = 200): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...followed, ...top]) {
    const k = norm(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function concertDay(date: string): { weekday: string; day: string; month: string; year: string } {
  const d = new Date(`${date}T12:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: String(d.getDate()),
    month: d.toLocaleDateString(undefined, { month: 'short' }),
    year: String(d.getFullYear()),
  };
}

export function concertTime(time: string | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
