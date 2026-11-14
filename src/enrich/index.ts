// Everything the app knows that Spotify doesn't tell it: biographies, credits,
// label details and song background, gathered from open sources.
import { isDemo } from '../spotify/auth';
import { cached, Provisional } from './cache';
import { demoAlbumInfo, demoArtistInfo, demoSongInfo } from './demo';
import { findAlbum, findArtist } from './musicbrainz';
import { cleanTitle, norm } from './text';
import type { AlbumInfo, ArtistInfo, SongInfo } from './types';
import { searchSummary, summaryForWikidata } from './wikipedia';

export function artistInfo(name: string): Promise<ArtistInfo | null> {
  if (isDemo()) return Promise.resolve(demoArtistInfo(name));
  return cached(`artist:${norm(name)}`, async () => {
    let flaky = false;
    const soft = () => {
      flaky = true;
      return null;
    };
    const mb = await findArtist(name).catch(soft);
    const bio =
      (mb?.wikidata && (await summaryForWikidata(mb.wikidata).catch(soft))) ||
      (await searchSummary('artist', name).catch(soft)) ||
      undefined;
    const links = [...(bio ? [{ label: 'Wikipedia', url: bio.url }] : []), ...(mb?.links || [])];
    const info: ArtistInfo | null = mb || bio ? { mbid: mb?.mbid, bio, facts: mb?.facts || [], genres: mb?.genres || [], links } : null;
    if (flaky && (!mb || !bio)) throw new Provisional(info);
    return info;
  });
}

export function albumInfo(album: { name: string; artist: string; upc?: string }): Promise<AlbumInfo | null> {
  if (isDemo()) return Promise.resolve(demoAlbumInfo(album.name, album.artist));
  return cached(`album:${norm(album.artist)}:${norm(album.name)}`, async () => {
    let flaky = false;
    const soft = () => {
      flaky = true;
      return null;
    };
    const mb = await findAlbum(album).catch(soft);
    const about =
      (mb?.wikidata && (await summaryForWikidata(mb.wikidata).catch(soft))) ||
      (await searchSummary('album', cleanTitle(album.name), album.artist).catch(soft)) ||
      undefined;
    const links = [...(about ? [{ label: 'Wikipedia', url: about.url }] : []), ...(mb?.links || [])];
    const info: AlbumInfo | null = mb || about ? { about, facts: mb?.facts || [], credits: mb?.credits || [], links } : null;
    if (flaky && (!mb || !about)) throw new Provisional(info);
    return info;
  });
}

export class NotConfigured extends Error {}

/** Song background from Genius, fetched through our own server so the Genius key never ships in the app. */
export function songInfo(title: string, artist: string): Promise<SongInfo | null> {
  if (isDemo()) return Promise.resolve(demoSongInfo(title, artist));
  return cached(`song:${norm(artist)}:${norm(title)}`, async () => {
    const res = await fetch(`/api/genius?title=${encodeURIComponent(cleanTitle(title))}&artist=${encodeURIComponent(artist)}`);
    if (res.status === 501 || (res.status === 404 && !res.headers.get('content-type')?.includes('json'))) throw new NotConfigured();
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Song info unavailable (${res.status})`);
    return (await res.json()) as SongInfo;
  });
}
