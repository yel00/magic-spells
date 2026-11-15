import { describe, expect, it } from 'vitest';
import { sortRecordings } from '../src/enrich/recordings';
import { editionLabel, groupEditions, otherEditions } from '../src/spotify/editions';
import type { AlbumRef } from '../src/spotify/types';

const album = (id: string, name: string, date: string, type = 'album'): AlbumRef => ({ id, name, uri: `spotify:album:${id}`, images: [], artists: [], release_date: date, album_type: type });

describe('album editions', () => {
  const list = [
    album('d', 'OK Computer (Deluxe Edition)', '2009-03-24'),
    album('o', 'OK Computer', '1997-06-16'),
    album('n', 'OK Computer OKNOTOK 1997 2017', '2017-06-23'),
    album('k', 'Kid A', '2000-10-02'),
    album('km', 'Kid A Mnesia', '2021-11-05'),
    album('r', 'Rumours (2004 Remaster)', '2004-03-01'),
    album('rs', 'Rumours (Super Deluxe)', '2013-01-29'),
    album('s', 'Creep', '1992-09-21', 'single'),
    album('s2', 'Creep - Acoustic Version', '1993-01-01', 'single'),
  ];
  const groups = groupEditions(list);
  const find = (id: string) => groups.find((g) => g.primary.id === id);

  it('folds deluxe and remastered editions into the plain album', () => {
    expect(find('o')?.editions.map((a) => a.id)).toEqual(['o', 'd']);
    expect(groups.some((g) => g.primary.id === 'd')).toBe(false);
  });
  it('keeps genuinely different albums apart', () => {
    expect(find('n')?.editions).toHaveLength(1);
    expect(find('k')?.editions).toHaveLength(1);
    expect(find('km')?.editions).toHaveLength(1);
  });
  it('uses the earliest edition when there is no plain one', () => {
    expect(find('r')?.editions.map((a) => a.id)).toEqual(['r', 'rs']);
  });
  it('never merges a single into an album', () => {
    expect(groupEditions([album('a', 'Creep', '1993-01-01'), album('b', 'Creep', '1992-01-01', 'single')])).toHaveLength(2);
    expect(find('s')?.editions.map((a) => a.id)).toEqual(['s', 's2']);
  });
  it('names what is different about each edition', () => {
    expect(editionLabel(list[0])).toBe('Deluxe Edition');
    expect(editionLabel(list[1])).toBe('Standard');
    expect(editionLabel(list[8])).toBe('Acoustic Version');
    expect(otherEditions(list, list[1]).map((a) => a.id)).toEqual(['d']);
    expect(otherEditions(list, list[3])).toEqual([]);
  });
});

describe('other recordings of a song', () => {
  const rec = (title: string, artist: string, year = '', disambiguation = '') => ({ title, disambiguation, 'first-release-date': year, 'artist-credit': [{ name: artist, artist: { name: artist } }] });
  const sorted = sortRecordings([
    rec('Hallelujah', 'Leonard Cohen', '1984'),
    rec('Hallelujah', 'Leonard Cohen', '1994', 'live'),
    rec('Hallelujah', 'Leonard Cohen', '2009', 'live'),
    rec('Hallelujah', 'Jeff Buckley', '1994'),
    rec('Hallelujah', 'Jeff Buckley', '2007', 'live'),
    rec('Hallelujah', 'John Cale', '1991'),
    rec('Hallelujah', '', '2000'),
  ], 'Hallelujah', 'Leonard Cohen');

  it('lists each covering artist once, earliest recording first', () => {
    expect(sorted.byOthers).toEqual([
      { title: 'Hallelujah', artist: 'John Cale', year: '1991', note: undefined },
      { title: 'Hallelujah', artist: 'Jeff Buckley', year: '1994', note: undefined },
    ]);
  });
  it('lists the original artist’s other takes but not the track itself', () => {
    expect(sorted.bySameArtist).toEqual([{ title: 'Hallelujah', artist: 'Leonard Cohen', year: '1994', note: 'live' }]);
  });
});
