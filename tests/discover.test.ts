import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the server functions
import { decodeEntities, shapeLastfmSimilar, shapeYoutube } from '../api/_lib/discover.js';
import { assembleMix, mapLimit } from '../src/discover/mix';
import type { Track } from '../src/spotify/types';

const track = (artist: string, n: number): Track => ({ id: `${artist}${n}`, name: `${artist} song ${n}`, uri: `spotify:track:${artist}${n}`, duration_ms: 1000, artists: [{ id: artist, name: artist, uri: `spotify:artist:${artist}` }] });
const tracksOf = (artist: string, count = 6) => Array.from({ length: count }, (_, i) => track(artist, i));
// A fixed sequence so the "random" choices are the same every run.
const rng = () => {
  let s = 7;
  return () => ((s = (s * 16807) % 2147483647), s / 2147483647);
};

describe('mix assembly', () => {
  const others = ['a', 'b', 'c', 'd', 'e', 'f'].map((a) => tracksOf(a));
  const mix = assembleMix(tracksOf('seed'), others, rng());

  it('uses two tracks from each similar artist and three from the seed', () => {
    const count = (a: string) => mix.filter((t) => t.artists[0].name === a).length;
    expect(['a', 'b', 'c', 'd', 'e', 'f'].map(count)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(count('seed')).toBe(3);
    expect(mix).toHaveLength(15);
  });
  it('opens with the seed artist and never repeats a track', () => {
    expect(mix[0].artists[0].name).toBe('seed');
    expect(new Set(mix.map((t) => t.uri)).size).toBe(mix.length);
  });
  it('never plays the same artist twice in a row', () => {
    for (let i = 1; i < mix.length; i++) expect(mix[i].artists[0].name).not.toBe(mix[i - 1].artists[0].name);
  });
  it('copes with artists that have no tracks and respects the size limit', () => {
    expect(assembleMix([], [[], tracksOf('a', 1)], rng())).toHaveLength(1);
    const many = Array.from({ length: 40 }, (_, i) => tracksOf(`x${i}`));
    expect(assembleMix(tracksOf('seed'), many, rng()).length).toBe(30);
  });
});

describe('mapLimit', () => {
  it('keeps order and never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});

describe('server shaping', () => {
  it('reads Last.fm similar artists and drops weak matches', () => {
    const json = { similarartists: { artist: [{ name: 'A', mbid: 'm1', match: '0.9' }, { name: 'B', mbid: '', match: '0.5' }, { name: 'C', match: '0.01' }] } };
    expect(shapeLastfmSimilar(json)).toEqual([{ name: 'A', mbid: 'm1' }, { name: 'B', mbid: undefined }]);
    expect(shapeLastfmSimilar({ similarartists: { artist: { name: 'Solo', match: '1' } } })).toEqual([{ name: 'Solo', mbid: undefined }]);
    expect(shapeLastfmSimilar({ error: 6 })).toEqual([]);
  });
  it('reads YouTube results and unescapes titles', () => {
    const json = { items: [
      { id: { videoId: 'abc' }, snippet: { title: 'Tom &amp; Jerry &#39;Live&#39; &quot;1999&quot;', channelTitle: 'KEXP', thumbnails: { medium: { url: 'm.jpg' }, default: { url: 'd.jpg' } } } },
      { id: { channelId: 'nope' }, snippet: { title: 'a channel' } },
    ] };
    expect(shapeYoutube(json)).toEqual([{ id: 'abc', title: `Tom & Jerry 'Live' "1999"`, channel: 'KEXP', thumb: 'm.jpg' }]);
    expect(decodeEntities('&#8217;')).toBe('’');
    expect(shapeYoutube({})).toEqual([]);
  });
});
