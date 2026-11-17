// Past concerts and what was played at them, from setlist.fm through our server.
import { cached, Provisional } from '../enrich/cache';
import { isDemo } from '../spotify/auth';
import type { Show, ShowPage } from './types';

export class ShowsNotConfigured extends Error {}

const DAY = 86_400_000;

async function ask<T>(query: string): Promise<T> {
  const res = await fetch(`/api/setlists?${query}`);
  if (res.status === 501) throw new ShowsNotConfigured();
  if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('unavailable');
  return (await res.json()) as T;
}

const DEMO_SHOWS: Show[] = [
  { id: 'de0001', date: '2023-07-14', artist: { name: 'The Slow Tide', mbid: 'demo' }, venue: 'Harbor Hall', city: 'Portland', region: 'OR', country: 'United States', tour: 'Soft Landing Tour', info: '', url: 'https://www.setlist.fm', songCount: 5, sets: [{ name: '', songs: [{ name: 'Soft Landing' }, { name: 'Low Tide' }, { name: 'Harbour Lights', info: 'extended outro' }] }, { name: 'Encore', songs: [{ name: 'Northern Line', cover: 'Paper Lanterns' }, { name: 'Goodnight' }] }] },
  { id: 'de0002', date: '2021-08-02', artist: { name: 'The Slow Tide', mbid: 'demo' }, venue: 'Summer Stage', city: 'Chicago', region: 'IL', country: 'United States', tour: '', info: '', url: 'https://www.setlist.fm', songCount: 3, sets: [{ name: '', songs: [{ name: 'Low Tide' }, { name: 'Soft Landing' }, { name: 'Goodnight' }] }] },
  { id: 'de0003', date: '2019-11-23', artist: { name: 'The Slow Tide', mbid: 'demo' }, venue: 'Paradiso', city: 'Amsterdam', region: '', country: 'Netherlands', tour: 'First Light', info: '', url: 'https://www.setlist.fm', songCount: 0, sets: [] },
];

const summary = ({ sets: _sets, ...rest }: Show) => rest;

/** An artist's past shows, newest first, twenty at a time. Null when the artist has none listed. */
export function artistShows(mbid: string, page = 1, year = ''): Promise<ShowPage | null> {
  if (isDemo()) {
    const shows = DEMO_SHOWS.filter((s) => !year || s.date.startsWith(year)).map(summary);
    return Promise.resolve(shows.length ? { shows, page: 1, perPage: 20, total: shows.length } : null);
  }
  return cached(
    `shows:${mbid}:${year}:${page}`,
    async () => {
      try {
        const data = await ask<ShowPage>(`mbid=${mbid}&p=${page}${year ? `&year=${year}` : ''}`);
        return data.shows.length ? data : null;
      } catch (e) {
        if (e instanceof ShowsNotConfigured) throw e;
        throw new Provisional(null);
      }
    },
    DAY,
  );
}

export function showById(id: string): Promise<Show | null> {
  if (isDemo()) return Promise.resolve(DEMO_SHOWS.find((s) => s.id === id) || null);
  return cached(
    `show:${id}`,
    async () => {
      try {
        return (await ask<{ show: Show }>(`id=${encodeURIComponent(id)}`)).show;
      } catch (e) {
        if (e instanceof ShowsNotConfigured) throw e;
        throw new Provisional(null);
      }
    },
    DAY,
  );
}

export const setlistSearchUrl = (artist: string) => `https://www.setlist.fm/search?query=${encodeURIComponent(artist)}`;
