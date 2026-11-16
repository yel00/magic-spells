import { cleanTitle, norm, sameName } from '../enrich/text';
import type { Track } from '../spotify/types';
import type { Pick, Seed } from './types';

/** The Spotify track that really is this pick: same title (ignoring edition wording) by the named artist. */
export function matchPick(tracks: Track[], pick: Pick): Track | null {
  const want = norm(cleanTitle(pick.title));
  return tracks.find((t) => t && norm(cleanTitle(t.name)) === want && t.artists.some((a) => sameName(a.name, pick.artist))) ?? null;
}

export function seedFrom(t: Track): Seed {
  return { title: t.name, artist: t.artists[0]?.name || '', album: t.album?.name, year: t.album?.release_date?.slice(0, 4) };
}

/** Candidate songs to start from: recent favourites first, then liked songs, one per song, at most two per artist. */
export function seedChoices(lists: Track[][], max = 24): Track[] {
  const seen = new Set<string>();
  const perArtist = new Map<string, number>();
  const out: Track[] = [];
  for (const t of lists.flat()) {
    if (!t?.uri || !t.artists?.[0]) continue;
    const key = `${norm(t.artists[0].name)}|${norm(cleanTitle(t.name))}`;
    const artist = norm(t.artists[0].name);
    if (seen.has(key) || (perArtist.get(artist) || 0) >= 2) continue;
    seen.add(key);
    perArtist.set(artist, (perArtist.get(artist) || 0) + 1);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** A playlist description within Spotify's 300-character limit. */
export function playlistDescription(summary: string, seeds: Seed[]): string {
  const from = `A tasting flight built from ${seeds.slice(0, 3).map((s) => s.title).join(', ')}${seeds.length > 3 ? ' and more' : ''}. `;
  const text = (from + summary).replace(/\s+/g, ' ').trim();
  return text.length <= 300 ? text : `${text.slice(0, 297).replace(/\s+\S*$/, '')}…`;
}
