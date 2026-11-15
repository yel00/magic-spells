import { describe, expect, it } from 'vitest';
import { slim, sortRecordings, type Recording } from '../src/enrich/recordings';
import { editionLabel, groupEditions, otherEditions } from '../src/spotify/editions';
import type { AlbumRef, Track } from '../src/spotify/types';
import { classify } from '../src/spotify/versions';

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
  const raw = [
    rec('Hallelujah', 'Leonard Cohen', '1984'),
    rec('Hallelujah', 'Leonard Cohen', '1994', 'live'),
    rec('Hallelujah', 'Leonard Cohen', '2009', 'live'),
    rec('Hallelujah', 'Jeff Buckley', '1994'),
    rec('Hallelujah', 'Jeff Buckley', '2007', 'live'),
    rec('Hallelujah', 'John Cale', '1991'),
    rec('Hallelujah', '', '2000'),
  ];
  const recordings = raw.map(slim).filter((r): r is Recording => !!r);
  const sorted = sortRecordings(recordings, 'Hallelujah', 'Leonard Cohen');

  it('reduces MusicBrainz records and drops ones with no artist', () => {
    expect(recordings).toHaveLength(6);
    expect(slim({ title: 'Duet', 'artist-credit': [{ name: 'A', joinphrase: ' feat. ', artist: { name: 'Artist A' } }, { name: 'B', artist: { name: 'B' } }] })).toEqual({ title: 'Duet', artist: 'A feat. B', artists: ['Artist A', 'B'], year: undefined, note: undefined });
  });
  it('lists each covering artist once, earliest recording first', () => {
    expect(sorted.byOthers.map((r) => [r.artist, r.year])).toEqual([['John Cale', '1991'], ['Jeff Buckley', '1994']]);
  });
  it('lists the original artist’s other takes but not the track itself', () => {
    expect(sorted.bySameArtist.map((r) => [r.note, r.year])).toEqual([['live', '1994']]);
  });
});

describe('versions on Spotify', () => {
  const track = (id: string, name: string, artist: string, album = 'Album'): Track => ({ id, name, uri: `spotify:track:${id}`, duration_ms: 1, artists: [{ id: artist, name: artist, uri: '' }], album: { id: album, name: album, uri: '', images: [], artists: [] } });
  const song = { name: 'Hallelujah', artist: 'Leonard Cohen', uri: 'spotify:track:orig' };
  const results = [
    track('orig', 'Hallelujah', 'Leonard Cohen'),
    track('comp', 'Hallelujah', 'Leonard Cohen', 'Greatest Hits'),
    track('live', 'Hallelujah - Live in London', 'Leonard Cohen'),
    track('live2', 'Hallelujah - Live in London', 'Leonard Cohen', 'Another Compilation'),
    track('jb', 'Hallelujah', 'Jeff Buckley'),
    track('jb2', 'Hallelujah', 'Jeff Buckley', 'Best Of'),
    track('pm', 'Hallelujah', 'Paramore'),
    track('jc', 'Hallelujah', 'John Cale'),
  ];
  const out = classify(results, song, new Set(['jeff buckley', 'john cale']));

  it('keeps the artist’s genuinely different takes, not the same recording on a compilation', () => {
    expect(out.sameArtist.map((t) => t.id)).toEqual(['live']);
  });
  it('separates confirmed covers from songs that merely share the title', () => {
    expect(out.covers.map((t) => t.id)).toEqual(['jb', 'jc']);
    expect(out.unconfirmed.map((t) => t.id)).toEqual(['pm']);
  });
  it('treats everything by other artists as unconfirmed when nothing is known about covers', () => {
    expect(classify(results, song, new Set()).unconfirmed.map((t) => t.id)).toEqual(['jb', 'pm', 'jc']);
  });
});
