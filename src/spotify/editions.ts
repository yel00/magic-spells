// Versions of an album. Spotify lists every remaster, deluxe and anniversary
// edition as its own album; here they are folded into one entry per album.
import { cleanTitle, norm } from '../enrich/text';
import type { AlbumRef } from './types';

export interface AlbumGroup {
  /** The edition to show and open by default. */
  primary: AlbumRef;
  /** Every edition, primary included, oldest first. */
  editions: AlbumRef[];
}

const EDITION_NOISE = /\b(deluxe|expanded|remaster|anniversary|edition|bonus|special|collector|super|legacy|reissue|mono|stereo|version|complete)\b/i;

/** What sets this edition apart from the plain album: the bracketed or dashed part of its title, if any. */
export function editionLabel(album: AlbumRef): string {
  const plain = cleanTitle(album.name);
  const rest = album.name.slice(plain.length).replace(/^[\s\-–—(\[]+|[\s)\]]+$/g, '').trim();
  return rest || 'Standard';
}

const groupKey = (a: AlbumRef) => `${a.album_type === 'album' ? 'album' : 'single'}|${norm(cleanTitle(a.name))}`;

/**
 * Fold editions together. The primary is the plain edition when there is one
 * (no "Deluxe"/"Remastered" in the title), otherwise the earliest release.
 */
export function groupEditions(albums: AlbumRef[]): AlbumGroup[] {
  const groups = new Map<string, AlbumRef[]>();
  for (const a of albums) {
    if (!a) continue;
    const k = groupKey(a);
    (groups.get(k) || groups.set(k, []).get(k)!).push(a);
  }
  const date = (a: AlbumRef) => a.release_date || '9999';
  return [...groups.values()].map((list) => {
    const editions = list.slice().sort((a, b) => date(a).localeCompare(date(b)) || a.name.length - b.name.length);
    const plain = editions.filter((a) => !EDITION_NOISE.test(a.name.slice(cleanTitle(a.name).length)));
    return { primary: (plain.length ? plain : editions)[0], editions };
  });
}

/** The other editions of one album among an artist's releases. */
export function otherEditions(albums: AlbumRef[], album: { id: string; name: string; album_type?: string }): AlbumRef[] {
  const k = groupKey(album as AlbumRef);
  return albums.filter((a) => a && a.id !== album.id && groupKey(a) === k).sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''));
}
