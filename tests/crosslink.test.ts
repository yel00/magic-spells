import { describe, expect, it } from 'vitest';
import { cleanArtist, groupWorks } from '../src/enrich/discogs';
import { bandLinks, creditsFrom, isMbid, linksFrom } from '../src/enrich/musicbrainz';
import { pickAlbum } from '../src/spotify/resolve';
import type { AlbumRef } from '../src/spotify/types';

const member = (name: string, id: string, over: any = {}) => ({ type: 'member of band', 'target-type': 'artist', direction: 'backward', artist: { name, id }, attributes: [], ...over });

describe('band members', () => {
  it('lists current members first, then former, with what they played and when', () => {
    const { members, memberOf } = bandLinks([
      member('Old Drummer', 'd1', { begin: '1985', end: '1990', ended: true, attributes: ['drums (drum set)'] }),
      member('Singer', 's1', { begin: '1985', attributes: ['lead vocals', 'guitar', 'original'] }),
      member('Bassist', 'b1', { begin: '1991' }),
      { type: 'collaboration', 'target-type': 'artist', direction: 'backward', artist: { name: 'Someone', id: 'x' } },
    ]);
    expect(members).toEqual([
      { name: 'Singer', mbid: 's1', detail: 'lead vocals, guitar · 1985–' },
      { name: 'Bassist', mbid: 'b1', detail: '1991–' },
      { name: 'Old Drummer', mbid: 'd1', detail: 'drums · 1985–1990' },
    ]);
    expect(memberOf).toEqual([]);
  });
  it('reads the other direction as bands a person is in, and merges repeat stints', () => {
    const { members, memberOf } = bandLinks([
      member('The Band', 'band', { direction: 'forward', begin: '1970', end: '1975', ended: true, attributes: ['guitar'] }),
      member('The Band', 'band', { direction: 'forward', begin: '1990', attributes: ['guitar'] }),
      member('The Band', 'band', { direction: 'forward', begin: '1990', attributes: ['lead vocals'] }),
    ]);
    expect(members).toEqual([]);
    expect(memberOf).toEqual([{ name: 'The Band', mbid: 'band', detail: 'guitar, lead vocals · 1970–' }]);
  });
});

describe('credit links', () => {
  it('keeps each credited person’s id so the name can link to their page', () => {
    const rel = (type: string, name: string, id: string) => ({ type, 'target-type': 'artist', artist: { name, id }, attributes: [] });
    const groups = creditsFrom({ relations: [rel('producer', 'Pat', 'mb-pat')], media: [{ tracks: [{ recording: { relations: [rel('mix', 'Lee', 'mb-lee')] } }] }] });
    expect(groups.find((g) => g.title === 'Produced by')!.people).toEqual([{ name: 'Pat', mbid: 'mb-pat' }]);
    expect(groups.find((g) => g.title === 'Engineering & arrangement')!.people).toEqual([{ name: 'Lee', detail: 'mixing', mbid: 'mb-lee' }]);
  });
  it('finds the Discogs id among an artist’s links', () => {
    expect(linksFrom([{ type: 'discogs', url: { resource: 'https://www.discogs.com/artist/3840' } }]).discogsId).toBe('3840');
    expect(linksFrom([{ type: 'discogs', url: { resource: 'https://www.discogs.com/label/12' } }]).discogsId).toBeUndefined();
  });
  it('recognises MusicBrainz ids', () => {
    expect(isMbid('a74b1b7f-71a5-4011-9441-d0b5e4122711')).toBe(true);
    expect(isMbid('~Nigel Godrich')).toBe(false);
  });
});

describe('Discogs credits', () => {
  it('groups by role, merges reissues, and orders newest first', () => {
    const groups = groupWorks([
      { title: 'OK Computer', artist: 'Radiohead', role: 'Producer', year: 2017 },
      { title: 'OK Computer', artist: 'Radiohead', role: 'Producer', year: 1997 },
      { title: 'Sea Change', artist: 'Beck', role: 'Producer', year: 2002 },
      { title: 'Ultraísta', artist: 'Ultraísta (2)', role: 'Main', year: 2012 },
      { title: 'Some Comp', artist: 'Various', role: 'TrackAppearance', year: 2005 },
      { title: 'Guest Spot', artist: 'Someone*', role: 'Appearance', year: 2010 },
      { title: 'Bootleg', artist: 'Radiohead', role: 'UnofficialRelease', year: 1999 },
      { title: 'Mixed Thing', artist: 'X', role: 'Mixed by', year: 2001 },
    ]);
    expect(groups.map((g) => g.role)).toEqual(['Own releases', 'Produced', 'Appears on', 'Mixed by']);
    expect(groups[1].works).toEqual([{ title: 'Sea Change', artist: 'Beck', year: 2002 }, { title: 'OK Computer', artist: 'Radiohead', year: 1997 }]);
    expect(groups[0].works[0].artist).toBe('Ultraísta');
    expect(groups[2].works.map((w) => w.title)).toEqual(['Guest Spot', 'Some Comp']);
    expect(cleanArtist('Nirvana (2)')).toBe('Nirvana');
  });
});

describe('matching an album on Spotify', () => {
  const album = (id: string, name: string, artist: string): AlbumRef => ({ id, name, uri: `spotify:album:${id}`, images: [], artists: [{ id: artist, name: artist, uri: '' }] });
  const results = [album('deluxe', 'OK Computer (Deluxe Edition)', 'Radiohead'), album('plain', 'OK Computer', 'Radiohead'), album('tribute', 'OK Computer', 'String Quartet Tribute'), album('other', 'Kid A', 'Radiohead')];
  it('prefers the plain edition by the right artist', () => {
    expect(pickAlbum(results, 'OK Computer', 'Radiohead')?.id).toBe('plain');
    expect(pickAlbum(results, 'OK Computer', 'radiohead')?.id).toBe('plain');
  });
  it('refuses a different artist or title, but accepts any artist for a compilation', () => {
    expect(pickAlbum(results, 'OK Computer', 'Coldplay')).toBeNull();
    expect(pickAlbum(results, 'The Bends', 'Radiohead')).toBeNull();
    expect(pickAlbum(results, 'Kid A', 'Various')?.id).toBe('other');
  });
});
