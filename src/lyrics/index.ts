// Lyrics from LRCLIB, a free community database of plain and time-synced
// lyrics. No key. Synced lyrics carry a timestamp per line, which lets the app
// highlight the line being sung and jump to a line when it is tapped.
import { cached, Provisional } from '../enrich/cache';
import { cleanTitle, norm } from '../enrich/text';
import { isDemo } from '../spotify/auth';

export interface LyricLine {
  /** Milliseconds from the start of the track, or null when the lyrics aren't synced. */
  t: number | null;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
  synced: boolean;
  instrumental: boolean;
}

/** Parse LRC text: "[01:23.45] line". A line can carry several timestamps; metadata tags are skipped. */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      out.push({ t: Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac, text });
    }
  }
  return out.sort((a, b) => a.t! - b.t!);
}

/** Index of the line being sung at `ms`, or -1 before the first line. */
export function activeLine(lines: LyricLine[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid].t ?? Infinity) <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

interface LrclibRecord {
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export function shape(r: LrclibRecord): Lyrics | null {
  if (r.instrumental) return { lines: [], synced: false, instrumental: true };
  if (r.syncedLyrics) {
    const lines = parseLrc(r.syncedLyrics);
    if (lines.length) return { lines, synced: true, instrumental: false };
  }
  if (r.plainLyrics?.trim()) return { lines: r.plainLyrics.split(/\r?\n/).map((text) => ({ t: null, text: text.trim() })), synced: false, instrumental: false };
  return null;
}

/** From several candidates, the one closest in length to the track (within 3 s), preferring synced lyrics. */
export function pickRecord(records: LrclibRecord[], durationMs: number): LrclibRecord | null {
  const near = records.filter((r) => typeof r.duration === 'number' && Math.abs(r.duration * 1000 - durationMs) <= 3000 && (r.syncedLyrics || r.plainLyrics || r.instrumental));
  near.sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || Math.abs(a.duration! * 1000 - durationMs) - Math.abs(b.duration! * 1000 - durationMs));
  return near[0] ?? null;
}

export function lyricsFor(track: { name: string; artist: string; album?: string; durationMs: number }): Promise<Lyrics | null> {
  if (isDemo()) return Promise.resolve(demoLyrics(track.name, track.durationMs));
  return cached(`lyrics:${norm(track.artist)}:${norm(track.name)}:${Math.round(track.durationMs / 1000)}`, async () => {
    const base = 'https://lrclib.net/api';
    try {
      // Exact lookup first: it only answers when title, artist, album and length all agree.
      const exact = new URLSearchParams({ track_name: track.name, artist_name: track.artist, album_name: track.album || '', duration: String(Math.round(track.durationMs / 1000)) });
      const res = await fetch(`${base}/get?${exact}`);
      if (res.ok) {
        const hit = shape((await res.json()) as LrclibRecord);
        if (hit) return hit;
      } else if (res.status !== 404) throw new Error(`LRCLIB ${res.status}`);
      // Otherwise search by title and artist, and accept a result only if its length matches this recording.
      const search = await fetch(`${base}/search?${new URLSearchParams({ track_name: cleanTitle(track.name), artist_name: track.artist })}`);
      if (!search.ok) throw new Error(`LRCLIB ${search.status}`);
      const pick = pickRecord((await search.json()) as LrclibRecord[], track.durationMs);
      return pick ? shape(pick) : null;
    } catch {
      throw new Provisional(null);
    }
  });
}

const DEMO_LINES = ['This is a made-up song', 'for a made-up band', 'so these are made-up words', 'to show how lyrics land', '', 'Each line lights up in time', 'as the music plays along', 'tap any line to jump there', 'and carry on the song', '', 'With a real library', 'the words come from LRCLIB', 'synced to the recording', 'whenever someone has timed them'];

function demoLyrics(name: string, durationMs: number): Lyrics {
  if (name.length % 7 === 0) return { lines: DEMO_LINES.map((text) => ({ t: null, text })), synced: false, instrumental: false };
  const step = Math.max(2500, Math.min(6000, durationMs / (DEMO_LINES.length * 3)));
  const lines: LyricLine[] = [];
  for (let t = 4000, i = 0; t < durationMs - 4000; t += step, i++) lines.push({ t: Math.round(t), text: DEMO_LINES[i % DEMO_LINES.length] });
  return { lines, synced: true, instrumental: false };
}
