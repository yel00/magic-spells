import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS server module
import { isoDate, readQuery, shapeList, shapeShow } from '../api/_lib/setlists.js';
// @ts-expect-error plain JS server module
import { cleanNote } from '../api/_lib/notes.js';
import { pathForUri } from '../src/lib/router';
import { dateParts, groupByBand, groupByYear, longDate, placeLine, recordingQuery, showUri } from '../src/shows/logic';
import { fitWithin } from '../src/shows/photos';
import type { ShowSummary } from '../src/shows/types';

const RAW = {
  id: '63de4613',
  eventDate: '23-08-1964',
  artist: { mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d', name: 'The Beatles' },
  venue: { name: 'Hollywood Bowl', city: { name: 'Hollywood', state: 'California', stateCode: 'CA', country: { code: 'US', name: 'United States' } } },
  tour: { name: 'North American Tour 1964' },
  sets: { set: [
    { song: [{ name: 'Twist and Shout', cover: { name: 'The Top Notes' } }, { name: 'Intro', tape: true }, { name: '' }] },
    { encore: 1, song: [{ name: 'Long Tall Sally', info: 'shortened', with: { name: 'Someone' } }] },
    { name: 'Empty', song: [] },
  ] },
  url: 'https://www.setlist.fm/setlist/the-beatles/1964/hollywood-bowl-hollywood-ca-63de4613.html',
};

describe('setlist.fm shaping', () => {
  it('turns day-month-year into a sortable date', () => {
    expect(isoDate('23-08-1964')).toBe('1964-08-23');
    expect(isoDate('1964-08-23')).toBe('');
    expect(isoDate(undefined)).toBe('');
  });

  it('shapes a show with its sets, covers, guests and taped songs', () => {
    const s = shapeShow(RAW);
    expect(s).toMatchObject({ id: '63de4613', date: '1964-08-23', venue: 'Hollywood Bowl', city: 'Hollywood', region: 'CA', country: 'United States', tour: 'North American Tour 1964', songCount: 3 });
    expect(s.sets).toEqual([
      { name: '', songs: [{ name: 'Twist and Shout', cover: 'The Top Notes' }, { name: 'Intro', tape: true }] },
      { name: 'Encore', songs: [{ name: 'Long Tall Sally', info: 'shortened', guest: 'Someone' }] },
    ]);
  });

  it('reads sets given without the wrapper', () => {
    const { sets, ...rest } = RAW;
    expect(shapeShow({ ...rest, set: sets.set }).songCount).toBe(3);
  });

  it('copes with a show nobody has filled in', () => {
    expect(shapeShow({ id: 'abc123', artist: { name: 'X' } })).toMatchObject({ date: '', venue: '', songCount: 0, sets: [] });
    expect(shapeShow({ id: 'abc123' })).toBeNull();
    expect(shapeShow(null)).toBeNull();
  });

  it('lists shows without their songs', () => {
    const page = shapeList({ setlist: [RAW, { junk: true }], page: 2, itemsPerPage: 20, total: 55 });
    expect(page).toMatchObject({ page: 2, perPage: 20, total: 55 });
    expect(page.shows).toHaveLength(1);
    expect(page.shows[0]).not.toHaveProperty('sets');
    expect(shapeList(null)).toEqual({ shows: [], page: 1, perPage: 20, total: 0 });
  });

  it('only accepts well-formed requests', () => {
    const mbid = 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d';
    expect(readQuery({ mbid })).toEqual({ kind: 'list', mbid, page: 1, year: '' });
    expect(readQuery({ mbid, p: '3', year: '1964' })).toEqual({ kind: 'list', mbid, page: 3, year: '1964' });
    expect(readQuery({ mbid, p: '-4', year: '64; drop' })).toEqual({ kind: 'list', mbid, page: 1, year: '' });
    expect(readQuery({ id: '63DE4613' })).toEqual({ kind: 'show', id: '63de4613' });
    expect(readQuery({ id: '../artist/x' })).toBeNull();
    expect(readQuery({ mbid: 'radiohead' })).toBeNull();
    expect(readQuery({})).toBeNull();
  });
});

const show = (id: string, name: string, date: string): ShowSummary => ({ id, date, artist: { name, mbid: '' }, venue: 'Hall', city: 'Leeds', region: '', country: 'United Kingdom', tour: '', info: '', url: '', songCount: 0 });

describe('show lists', () => {
  const shows = [show('a', 'Wire', '1979-03-01'), show('b', 'Can', '2001-05-05'), show('c', 'Wire', '2001-01-09'), show('d', 'can', '')];

  it('groups by year, newest first, undated last', () => {
    expect(groupByYear(shows).map((g) => [g.title, g.shows.map((s) => s.id)])).toEqual([['2001', ['b', 'c']], ['1979', ['a']], ['Date unknown', ['d']]]);
  });

  it('groups by band alphabetically, each newest first', () => {
    const g = groupByBand(shows);
    expect(g.map((x) => x.title.toLowerCase())).toEqual(['can', 'can', 'wire']);
    expect(g[2].shows.map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('writes dates and places plainly', () => {
    expect(dateParts('2012-06-05')).toEqual({ day: '5', month: 'Jun', year: '2012' });
    expect(longDate('2012-06-05')).toBe('5 Jun 2012');
    expect(longDate('')).toBe('Date unknown');
    expect(placeLine(show('a', 'Wire', ''))).toBe('Hall · Leeds, United Kingdom');
    expect(placeLine({ venue: 'The Fillmore', city: 'San Francisco', region: 'CA', country: 'United States' })).toBe('The Fillmore · San Francisco, CA');
  });

  it('asks YouTube for that particular night', () => {
    expect(recordingQuery(show('a', 'Wire', '1979-03-01'))).toBe('Wire live Hall 1979');
    expect(recordingQuery({ ...show('a', 'Wire', ''), venue: '' })).toBe('Wire live Leeds');
  });

  it('files notes against a show and finds its page again', () => {
    expect(showUri('63de4613')).toBe('setlistfm:show:63de4613');
    expect(pathForUri(showUri('63de4613'))).toBe('/show/63de4613');
    const note = { id: '00000000-0000-4000-8000-000000000001', subject_uri: showUri('63de4613'), parent_uri: null, title: 'T', subtitle: '', image: null, body: 'loud', created_at: 1, updated_at: 2, deleted: false };
    expect(cleanNote(note)).toMatchObject({ subject_uri: 'setlistfm:show:63de4613' });
    expect(cleanNote({ ...note, subject_uri: 'setlistfm:show:../x' })).toBeNull();
  });

  it('shrinks big pictures and leaves small ones alone', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
