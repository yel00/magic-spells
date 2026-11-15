// Turning a title-and-artist from another catalogue into the right Spotify album.
import { cached } from '../enrich/cache';
import { cleanTitle, norm, sameName } from '../enrich/text';
import { go } from '../lib/router';
import { toast } from '../state/ui';
import * as api from './api';
import { isDemo } from './auth';
import type { AlbumRef } from './types';

/** Pick the album that really is this title, preferring the named artist and a plain (non-deluxe) edition. */
export function pickAlbum(albums: AlbumRef[], title: string, artist: string): AlbumRef | null {
  const want = norm(cleanTitle(title));
  const various = /^various/i.test(artist) || !artist;
  const matches = albums.filter((a) => a && norm(cleanTitle(a.name)) === want && (various || a.artists.some((x) => sameName(x.name, artist))));
  return matches.sort((a, b) => a.name.length - b.name.length)[0] ?? null;
}

export function findAlbumOnSpotify(title: string, artist: string): Promise<{ id: string } | null> {
  return cached(`sp:album:${isDemo() ? 'demo:' : ''}${norm(artist)}:${norm(title)}`, async () => {
    const r = await api.searchAlbums(cleanTitle(title), /^various/i.test(artist) ? '' : artist);
    const hit = pickAlbum(r.albums?.items || [], title, artist);
    return hit ? { id: hit.id } : null;
  });
}

/** Open the album if Spotify has it; otherwise say so. */
export async function openAlbum(title: string, artist: string) {
  try {
    const hit = await findAlbumOnSpotify(title, artist);
    if (hit) go(`/album/${hit.id}`);
    else toast(`“${title}” isn’t on Spotify under that name.`);
  } catch {
    toast('Couldn’t reach Spotify to look that up.');
  }
}
