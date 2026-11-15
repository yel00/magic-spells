// Other recordings of a song: covers by other artists, and the same artist's
// live or alternate takes. MusicBrainz links every recording to the
// composition ("work") it performs, so one composition leads to all of them.
import { cached, Provisional } from './cache';
import { mb } from './musicbrainz';
import { cleanTitle, norm, sameName } from './text';

export interface OtherRecording {
  title: string;
  artist: string;
  year?: string;
  /** "live", "demo", "acoustic"… when MusicBrainz says so. */
  note?: string;
}

export interface OtherRecordings {
  byOthers: OtherRecording[];
  bySameArtist: OtherRecording[];
}

const q = (s: string) => encodeURIComponent(`"${s.replace(/["\\]/g, ' ')}"`);

/** Sort a composition's recordings into covers and the original artist's other takes, one entry per artist or take. */
export function sortRecordings(recordings: any[], title: string, artist: string): OtherRecordings {
  const others = new Map<string, OtherRecording>();
  const same = new Map<string, OtherRecording>();
  for (const r of recordings || []) {
    const credit = (r['artist-credit'] || []).map((c: any) => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join('').trim();
    if (!credit || !r.title) continue;
    const year = (r['first-release-date'] || '').slice(0, 4) || undefined;
    const rec: OtherRecording = { title: r.title, artist: credit, year, note: r.disambiguation || undefined };
    const mine = (r['artist-credit'] || []).some((c: any) => sameName(c.artist?.name || c.name || '', artist));
    if (mine) {
      // The same artist: only takes that differ from the track itself (live, demo, remix…).
      const label = norm(`${r.title} ${r.disambiguation || ''}`);
      if (label === norm(cleanTitle(title)) || label === norm(title)) continue;
      if (!same.has(label)) same.set(label, rec);
    } else {
      const have = others.get(norm(credit));
      // One entry per covering artist: their earliest recording of it.
      if (!have || (year && (!have.year || year < have.year))) others.set(norm(credit), rec);
    }
  }
  const byYear = (a: OtherRecording, b: OtherRecording) => (a.year || '9999').localeCompare(b.year || '9999');
  return { byOthers: [...others.values()].sort(byYear).slice(0, 40), bySameArtist: [...same.values()].sort(byYear).slice(0, 15) };
}

export function otherRecordings(track: { name: string; artist: string }): Promise<OtherRecordings | null> {
  return cached(`recordings:${norm(track.artist)}:${norm(track.name)}`, async () => {
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
      // Much-covered songs have hundreds of recordings; read up to three pages (300).
      const all: any[] = [];
      for (let page = 0; page < 3; page++) {
        const batch = await mb<{ recordings?: any[]; 'recording-count'?: number }>(`/recording?work=${work.id}&inc=artist-credits&limit=100&offset=${page * 100}`);
        all.push(...(batch.recordings || []));
        if (all.length >= (batch['recording-count'] ?? 0) || !batch.recordings?.length) break;
      }
      const sorted = sortRecordings(all, track.name, track.artist);
      return sorted.byOthers.length || sorted.bySameArtist.length ? sorted : null;
    } catch {
      throw new Provisional(null);
    }
  });
}
