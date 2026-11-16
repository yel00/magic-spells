// What a song borrows from other recordings, and what has borrowed from it.
// Two kinds matter: a *sample* lifts a piece of the original recording itself;
// an *interpolation* replays a melody, riff or lyric from it with new
// performances. Genius records both; MusicBrainz records samples.
import { cached, Provisional } from './cache';
import { mb } from './musicbrainz';
import { cleanTitle, norm, sameName } from './text';
import type { RelatedSongs } from './types';

export interface Borrowed {
  title: string;
  artist: string;
  url?: string;
  sources: string[];
}

export interface BorrowGroup {
  kind: 'samples' | 'interpolates' | 'sampled_in' | 'interpolated_by';
  label: string;
  hint: string;
  items: Borrowed[];
}

export interface MbSamples {
  samples: { title: string; artist: string }[];
  sampledBy: { title: string; artist: string }[];
}

const GROUPS: { kind: BorrowGroup['kind']; genius: string; label: string; hint: string }[] = [
  { kind: 'samples', genius: 'Samples', label: 'Samples', hint: 'Uses a piece of the original recording' },
  { kind: 'interpolates', genius: 'Interpolates', label: 'Borrows a melody, riff or lyric from', hint: 'Replayed or re-sung, not lifted from the recording' },
  { kind: 'sampled_in', genius: 'Sampled in', label: 'Sampled by', hint: 'Later songs that use a piece of this recording' },
  { kind: 'interpolated_by', genius: 'Interpolated by', label: 'Melody, riff or lyric reused by', hint: 'Later songs that replay part of this one' },
];

/** The Genius relationship labels this section takes over (the rest stay in the song's background). */
export const BORROW_LABELS = new Set(GROUPS.map((g) => g.genius));

const credit = (r: any): string => (r?.['artist-credit'] || []).map((c: any) => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join('').trim();

/** Read "samples material" relationships off one MusicBrainz recording. */
export function samplesFrom(recording: any): MbSamples {
  const out: MbSamples = { samples: [], sampledBy: [] };
  for (const rel of recording?.relations || []) {
    if (rel.type !== 'samples material' || rel['target-type'] !== 'recording' || !rel.recording?.title) continue;
    // "forward" means this recording samples the other one.
    (rel.direction === 'backward' ? out.sampledBy : out.samples).push({ title: rel.recording.title, artist: credit(rel.recording) });
  }
  return out;
}

/** Combine what Genius and MusicBrainz say, one entry per song, noting who says it. */
export function mergeBorrowings(genius: RelatedSongs[] | undefined, music: MbSamples | null): BorrowGroup[] {
  return GROUPS.map((g) => {
    const items = new Map<string, Borrowed>();
    const add = (title: string, artist: string, source: string, url?: string) => {
      // Without an artist, match on title alone so the same song from two sources isn't listed twice.
      const key = norm(cleanTitle(title));
      const have = [...items.values()].find((i) => norm(cleanTitle(i.title)) === key && (!artist || !i.artist || sameName(i.artist, artist)));
      if (have) {
        if (!have.sources.includes(source)) have.sources.push(source);
        have.artist ||= artist;
        have.url ||= url;
      } else items.set(`${key}|${norm(artist)}|${items.size}`, { title, artist, url, sources: [source] });
    };
    for (const s of genius?.find((r) => r.label === g.genius)?.songs || []) add(s.title, s.artist, 'Genius', s.url);
    const fromMb = g.kind === 'samples' ? music?.samples : g.kind === 'sampled_in' ? music?.sampledBy : undefined;
    for (const s of fromMb || []) add(s.title, s.artist, 'MusicBrainz');
    return { kind: g.kind, label: g.label, hint: g.hint, items: [...items.values()] };
  }).filter((g) => g.items.length);
}

const q = (s: string) => encodeURIComponent(`"${s.replace(/["\\]/g, ' ')}"`);

/** Samples recorded in MusicBrainz for a track, checking its three best-matching recordings. */
export function mbSamples(track: { name: string; artist: string }): Promise<MbSamples | null> {
  return cached(`samples:${norm(track.artist)}:${norm(track.name)}`, async () => {
    try {
      const title = cleanTitle(track.name);
      const found = await mb<{ recordings?: any[] }>(`/recording?query=recording:${q(title)}%20AND%20artist:${q(track.artist)}&limit=10`);
      const hits = (found.recordings || [])
        .filter((r) => r.score >= 85 && norm(r.title) === norm(title) && (r['artist-credit'] || []).some((c: any) => sameName(c.name, track.artist) || sameName(c.artist?.name || '', track.artist)))
        .slice(0, 3);
      const all: MbSamples = { samples: [], sampledBy: [] };
      for (const hit of hits) {
        const found = samplesFrom(await mb<any>(`/recording/${hit.id}?inc=recording-rels+artist-credits`));
        all.samples.push(...found.samples);
        all.sampledBy.push(...found.sampledBy);
      }
      return all.samples.length || all.sampledBy.length ? all : null;
    } catch {
      throw new Provisional(null);
    }
  });
}

export const whoSampledUrl = (title: string, artist: string) => `https://www.whosampled.com/search/?q=${encodeURIComponent(`${artist} ${cleanTitle(title)}`)}`;
