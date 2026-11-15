// Tempo and key for a recording, from open databases. Spotify closed its own
// audio-features data to new apps, so this uses MusicBrainz to identify the
// recording and AcousticBrainz for the analysis. AcousticBrainz stopped taking
// new submissions in 2022, so recent releases are often missing; the
// microphone analyzer covers those.
import { cached, Provisional } from '../enrich/cache';
import { mb } from '../enrich/musicbrainz';
import { cleanTitle, norm, sameName } from '../enrich/text';
import { isDemo } from '../spotify/auth';
import { parseKey, type Key } from './keys';

export interface TrackAnalysis {
  bpm: number;
  key: Key | null;
  /** How many analysed copies of the recording agreed. */
  samples: number;
}

interface AbEntry {
  rhythm?: { bpm?: number };
  tonal?: { key_key?: string; key_scale?: string; key_strength?: number };
}

const q = (s: string) => encodeURIComponent(`"${s.replace(/["\\]/g, ' ')}"`);

/** Combine several analyses of the same recording: the median tempo and the most common key. */
export function combine(entries: AbEntry[]): TrackAnalysis | null {
  const bpms = entries.map((e) => e.rhythm?.bpm).filter((b): b is number => !!b && b > 30 && b < 300).sort((a, b) => a - b);
  if (!bpms.length) return null;
  const votes = new Map<string, { key: Key; weight: number }>();
  for (const e of entries) {
    const key = e.tonal?.key_key ? parseKey(e.tonal.key_key, e.tonal.key_scale || 'major') : null;
    if (!key) continue;
    const id = `${key.tonic}${key.mode}`;
    const v = votes.get(id) || votes.set(id, { key, weight: 0 }).get(id)!;
    v.weight += e.tonal?.key_strength ?? 0.5;
  }
  const top = [...votes.values()].sort((a, b) => b.weight - a.weight)[0];
  return { bpm: Math.round(bpms[Math.floor(bpms.length / 2)]), key: top?.key ?? null, samples: bpms.length };
}

/**
 * Order candidate recordings so the ones most likely to be this exact version
 * come first: a matching length is the best evidence (it separates the studio
 * cut from live takes and remixes that share a title).
 */
export function rankRecordings(recordings: { id: string; length?: number | null }[], durationMs?: number): { near: string[]; rest: string[] } {
  const near: string[] = [];
  const rest: string[] = [];
  for (const r of recordings) (durationMs && r.length && Math.abs(r.length - durationMs) <= 4000 ? near : rest).push(r.id);
  return { near, rest };
}

async function analyses(ids: string[]): Promise<AbEntry[]> {
  if (!ids.length) return [];
  const res = await fetch(`https://acousticbrainz.org/api/v1/low-level?recording_ids=${ids.slice(0, 25).join(';')}`);
  if (!res.ok) throw new Error(`AcousticBrainz ${res.status}`);
  const data = (await res.json()) as Record<string, Record<string, AbEntry>>;
  return Object.entries(data).filter(([id]) => ids.includes(id)).flatMap(([, subs]) => Object.values(subs).slice(0, 1));
}

export function trackAnalysis(track: { name: string; artist: string; durationMs?: number }): Promise<TrackAnalysis | null> {
  if (isDemo()) {
    const n = norm(track.name).length + norm(track.artist).length;
    return Promise.resolve({ bpm: 84 + ((n * 7) % 70), key: { tonic: n % 12, mode: n % 3 ? 'major' : 'minor' }, samples: 3 });
  }
  return cached(`tempo:${norm(track.artist)}:${norm(track.name)}`, async () => {
    try {
      const title = cleanTitle(track.name);
      const found = await mb<{ recordings?: any[] }>(`/recording?query=recording:${q(title)}%20AND%20artist:${q(track.artist)}&limit=50`);
      const matches = (found.recordings || []).filter(
        (r) => r.score >= 85 && norm(r.title) === norm(title) && (r['artist-credit'] || []).some((c: any) => sameName(c.name, track.artist) || sameName(c.artist?.name || '', track.artist)),
      );
      if (!matches.length) return null;
      const { near, rest } = rankRecordings(matches, track.durationMs);
      // Same-length recordings first; only if none of those were ever analysed, fall back to the rest.
      return combine(await analyses(near)) ?? combine(await analyses(rest));
    } catch {
      throw new Provisional(null);
    }
  });
}
