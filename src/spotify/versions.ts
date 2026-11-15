// The versions of a song that Spotify can play right now, found by title.
// A title alone doesn't prove it is the same song (many songs share a name),
// so results are sorted by how sure we are.
import { cleanTitle, norm, sameName } from '../enrich/text';
import * as api from './api';
import type { Track } from './types';

export interface SpotifyVersions {
  /** Other versions by the same artist: remasters, live takes, alternate mixes. */
  sameArtist: Track[];
  /** By artists that MusicBrainz confirms have recorded this composition. */
  covers: Track[];
  /** Same title, but nothing confirms it is the same song. */
  unconfirmed: Track[];
}

/** One page (ten) of Spotify tracks whose title is this song's title. */
export async function titleMatches(title: string, page: number): Promise<{ tracks: Track[]; more: boolean }> {
  const r = await api.searchByTitle(cleanTitle(title), page * 10);
  const items = (r.tracks?.items || []).filter(Boolean);
  const want = norm(cleanTitle(title));
  return { tracks: items.filter((t) => norm(cleanTitle(t.name)) === want), more: !!r.tracks?.next && items.length > 0 };
}

export function classify(tracks: Track[], song: { name: string; artist: string; uri: string }, coverArtists: Set<string>): SpotifyVersions {
  const out: SpotifyVersions = { sameArtist: [], covers: [], unconfirmed: [] };
  const seenTake = new Set<string>([norm(song.name)]);
  const seenArtist = new Set<string>();
  for (const t of tracks) {
    if (t.uri === song.uri) continue;
    if (t.artists.some((a) => sameName(a.name, song.artist))) {
      // The identical recording reappears on compilations under the same name; a different name means a different take.
      const take = norm(t.name);
      if (seenTake.has(take)) continue;
      seenTake.add(take);
      out.sameArtist.push(t);
      continue;
    }
    const who = norm(t.artists[0]?.name || '');
    if (!who || seenArtist.has(who)) continue;
    seenArtist.add(who);
    (t.artists.some((a) => coverArtists.has(norm(a.name))) ? out.covers : out.unconfirmed).push(t);
  }
  return out;
}
