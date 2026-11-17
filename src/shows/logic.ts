import type { ShowSummary } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2012-06-15" → { day: "15", month: "Jun", year: "2012" }. */
export function dateParts(date: string): { day: string; month: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return { day: '', month: '', year: date.slice(0, 4) };
  return { day: String(Number(m[3])), month: MONTHS[Number(m[2]) - 1] || '', year: m[1] };
}

export function longDate(date: string): string {
  const p = dateParts(date);
  return [p.day, p.month, p.year].filter(Boolean).join(' ') || 'Date unknown';
}

export function placeLine(s: Pick<ShowSummary, 'venue' | 'city' | 'region' | 'country'>): string {
  const where = [s.city, s.country === 'United States' ? s.region : s.country].filter(Boolean).join(', ');
  return [s.venue, where].filter(Boolean).join(' · ');
}

const newestFirst = (a: ShowSummary, b: ShowSummary) => b.date.localeCompare(a.date) || a.artist.name.localeCompare(b.artist.name);

export interface ShowGroup {
  title: string;
  shows: ShowSummary[];
}

/** Shows under the year they happened, newest year first. */
export function groupByYear(shows: ShowSummary[]): ShowGroup[] {
  const groups = new Map<string, ShowSummary[]>();
  for (const s of [...shows].sort(newestFirst)) {
    const y = s.date.slice(0, 4) || 'Date unknown';
    groups.set(y, [...(groups.get(y) || []), s]);
  }
  return [...groups].map(([title, list]) => ({ title, shows: list }));
}

/** Shows under the band that played, bands in alphabetical order, each band's newest show first. */
export function groupByBand(shows: ShowSummary[]): ShowGroup[] {
  const groups = new Map<string, ShowSummary[]>();
  for (const s of [...shows].sort(newestFirst)) groups.set(s.artist.name, [...(groups.get(s.artist.name) || []), s]);
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([title, list]) => ({ title, shows: list }));
}

/** What to ask YouTube for to find recordings of one particular night. */
export function recordingQuery(s: Pick<ShowSummary, 'artist' | 'venue' | 'city' | 'date'>): string {
  return [s.artist.name, 'live', s.venue || s.city, s.date.slice(0, 4)].filter(Boolean).join(' ');
}

/** The address used for notes about a show, shaped like a Spotify URI so notes sync treats it the same way. */
export const showUri = (id: string) => `setlistfm:show:${id}`;
