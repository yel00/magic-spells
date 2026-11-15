import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the server function
import { geohash, shapeEvents } from '../api/_lib/concerts.js';
import { concertTime, localDate, mergeConcerts, watchList } from '../src/concerts/logic';

describe('geohash', () => {
  it('matches the standard reference point', () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
    expect(geohash(41.85, -87.65, 6)).toMatch(/^dp3w/); // Chicago
  });
});

describe('Ticketmaster shaping', () => {
  const event = (over: any = {}) => ({
    id: 'e1', name: 'Radiohead', url: 'https://tickets.example/e1',
    dates: { start: { localDate: '2027-03-04', localTime: '19:30:00' }, status: { code: 'onsale' } },
    images: [{ ratio: '16_9', width: 2048, url: 'big.jpg' }, { ratio: '16_9', width: 640, url: 'mid.jpg' }, { ratio: '3_2', width: 640, url: 'other.jpg' }],
    distance: 12.4,
    _embedded: { venues: [{ name: 'United Center', city: { name: 'Chicago' }, state: { stateCode: 'IL' } }], attractions: [{ name: 'Radiohead' }, { name: 'Support Act' }] },
    ...over,
  });
  it('keeps shows where the artist is on the bill', () => {
    expect(shapeEvents({ _embedded: { events: [event()] } }, 'radiohead')).toEqual([{
      id: 'e1', name: 'Radiohead', date: '2027-03-04', time: '19:30', venue: 'United Center', city: 'Chicago, IL',
      url: 'https://tickets.example/e1', lineup: ['Radiohead', 'Support Act'], image: 'mid.jpg', status: undefined, distance: 12,
    }]);
  });
  it('drops tribute acts, cancelled shows and events with no date', () => {
    const tribute = event({ id: 'e2', name: 'Radiohead Tribute Night', _embedded: { attractions: [{ name: 'The Bends: A Radiohead Tribute' }] } });
    const cancelled = event({ id: 'e3', dates: { start: { localDate: '2027-03-05' }, status: { code: 'cancelled' } } });
    const undated = event({ id: 'e4', dates: { start: {}, status: { code: 'onsale' } } });
    expect(shapeEvents({ _embedded: { events: [tribute, cancelled, undated] } }, 'Radiohead')).toEqual([]);
    expect(shapeEvents({}, 'Radiohead')).toEqual([]);
  });
  it('flags postponed shows and omits an unknown time', () => {
    const e = event({ dates: { start: { localDate: '2027-03-04', noSpecificTime: true }, status: { code: 'postponed' } } });
    expect(shapeEvents({ _embedded: { events: [e] } }, 'Radiohead')[0]).toMatchObject({ status: 'postponed', time: undefined });
  });
});

describe('concert lists', () => {
  const show = (id: string, date: string) => ({ id, name: id, date, venue: 'V', city: 'C', url: 'u', lineup: [] });
  it('merges a shared bill into one show and sorts by date', () => {
    const merged = mergeConcerts([
      { artist: 'A', events: [show('fest', '2027-06-01'), show('a-solo', '2027-05-01')] },
      { artist: 'B', events: [show('fest', '2027-06-01'), show('old', '2020-01-01')] },
    ], '2026-11-15');
    expect(merged.map((c) => [c.id, c.artists])).toEqual([['a-solo', ['A']], ['fest', ['A', 'B']]]);
  });
  it('builds the watch list: followed first, no duplicates, capped', () => {
    expect(watchList(['Beyoncé', 'Muse'], ['beyonce', 'Blur', 'MUSE'], 3)).toEqual(['Beyoncé', 'Muse', 'Blur']);
    expect(watchList(['a', 'b', 'c'], [], 2)).toEqual(['a', 'b']);
  });
  it('formats local dates and times', () => {
    expect(localDate(new Date(2027, 0, 5))).toBe('2027-01-05');
    expect(concertTime(undefined)).toBe('');
    expect(concertTime('19:30')).toMatch(/7:30/);
  });
});
