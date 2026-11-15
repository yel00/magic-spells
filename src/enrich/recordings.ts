// Other recordings of a song: covers by other artists, and the same artist's
// live or alternate takes. MusicBrainz links every recording to the
// composition ("work") it performs, so one composition leads to all of them.
import { cached, Provisional } from './cache';
import { mb } from './musicbrainz';
import { cleanTitle, norm, sameName } from './text';

/** One recording, reduced to what the app shows. */
export interface Recording {
  title: string;
  /** The credit as printed, e.g. "A feat. B". */
  artist: string;
  /** Each credited artist's own name, for matching. */
  artists: string[];
  year?: string;
  /** "live", "demo", "acoustic"… when MusicBrainz says so. */
  note?: string;
}

export interface OtherRecordings {
  byOthers: Recording[];
  bySameArtist: Recording[];
}

export const PAGE = 100;
/** Stop at 1,000 recordings: beyond that each page still costs a second and adds little. */
export const MAX_PAGES = 10;

const q = (s: string) => encodeURIComponent(`"${s.replace(/["\\]/g, ' ')}"`);

export function slim(r: any): Recording | null {
  const credits: any[] = r?.['artist-credit'] || [];
  const artist = credits.map((c) => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join('').trim();
  if (!artist || !r.title) return null;
  return {
    title: r.title,
    artist,
    artists: credits.map((c) => c.artist?.name || c.name || '').filter(Boolean),
    year: (r['first-release-date'] || '').slice(0, 4) || undefined,
    note: r.disambiguation || undefined,
  };
}

/** Sort a composition's recordings into covers and the original artist's other takes, one entry per artist or take. */
export function sortRecordings(recordings: Recording[], title: string, artist: string): OtherRecordings {
  const others = new Map<string, Recording>();
  const same = new Map<string, Recording>();
  for (const rec of recordings) {
    if (rec.artists.some((a) => sameName(a, artist))) {
      // The same artist: only takes that differ from the track itself (live, demo, remix…).
      const label = norm(`${rec.title} ${rec.note || ''}`);
      if (label === norm(cleanTitle(title)) || label === norm(title)) continue;
      if (!same.has(label)) same.set(label, rec);
    } else {
      const have = others.get(norm(rec.artist));
      // One entry per covering artist: their earliest recording of it.
      if (!have || (rec.year && (!have.year || rec.year < have.year))) others.set(norm(rec.artist), rec);
    }
  }
  const byYear = (a: Recording, b: Recording) => (a.year || '9999').localeCompare(b.year || '9999');
  return { byOthers: [...others.values()].sort(byYear), bySameArtist: [...same.values()].sort(byYear) };
}

export interface Work {
  id: string;
  /** How many recordings of this composition MusicBrainz has in total. */
  total: number;
  first: Recording[];
}

/** Find the composition a track performs, and the first page of its recordings. */
export function findWork(track: { name: string; artist: string }): Promise<Work | null> {
  return cached(`work:${norm(track.artist)}:${norm(track.name)}`, async () => {
    try {
      const title = cleanTitle(track.name);
      const found = await mb<{ recordings?: any[] }>(`/recording?query=recording:${q(title)}%20AND%20artist:${q(track.artist)}&limit=10`);
      const hit = (found.recordings || []).find(
        (r) => r.score >= 85 && norm(r.title) === norm(title) && (r['artist-credit'] || []).some((c: any) => sameName(c.name, track.artist) || sameName(c.artist?.name || '', track.artist)),
      );
      if (!hit) return null;
      const rec = await mb<any>(`/recording/${hit.id}?inc=work-rels`);
      const work = (rec.relations || []).find((r: any) => r['target-type'] === 'work' && r.type === 'performance')?.work;
      if (!work?.id) return null;
      const page = await fetchPage(work.id, 0);
      return { id: work.id, total: page.total, first: page.recordings };
    } catch {
      throw new Provisional(null);
    }
  });
}

async function fetchPage(workId: string, page: number): Promise<{ recordings: Recording[]; total: number }> {
  const batch = await mb<{ recordings?: any[]; 'recording-count'?: number }>(`/recording?work=${workId}&inc=artist-credits&limit=${PAGE}&offset=${page * PAGE}`);
  return { recordings: (batch.recordings || []).map(slim).filter((r): r is Recording => !!r), total: batch['recording-count'] ?? 0 };
}

/** A further page of a composition's recordings (page 1 = recordings 101–200). */
export function workPage(workId: string, page: number): Promise<Recording[]> {
  return cached(`work:${workId}:p${page}`, async () => {
    try {
      return (await fetchPage(workId, page)).recordings;
    } catch {
      throw new Provisional(null);
    }
  }).then((r) => r || []);
}
