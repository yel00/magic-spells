import { describe, expect, it } from 'vitest';
import { formatDuration, formatTime, greeting, uniqueBy } from '../src/lib/format';
import { parseRoute, pathForUri } from '../src/lib/router';
import { challengeFor } from '../src/spotify/auth';
import { entryTrack, playlistCount } from '../src/spotify/api';

describe('PKCE', () => {
  it('matches the RFC 7636 appendix B example', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('format', () => {
  it('formats track times', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(61_000)).toBe('1:01');
    expect(formatTime(3_725_000)).toBe('1:02:05');
    expect(formatTime(-5)).toBe('0:00');
  });
  it('formats album lengths', () => {
    expect(formatDuration(42 * 60_000)).toBe('42 min');
    expect(formatDuration(125 * 60_000)).toBe('2 hr 5 min');
  });
  it('keeps the first of each key in order', () => {
    expect(uniqueBy([{ k: 'a' }, { k: 'b' }, { k: 'a' }, { k: '' }], (x) => x.k)).toEqual([{ k: 'a' }, { k: 'b' }]);
  });
  it('greets by time of day', () => {
    expect(greeting(8)).toBe('Good morning');
    expect(greeting(20)).toBe('Good evening');
  });
});

describe('router', () => {
  it('parses hash routes', () => {
    expect(parseRoute('')).toEqual({ name: 'home', id: undefined });
    expect(parseRoute('#/album/abc')).toEqual({ name: 'album', id: 'abc' });
  });
  it('maps Spotify URIs to pages', () => {
    expect(pathForUri('spotify:artist:x1')).toBe('/artist/x1');
    expect(pathForUri('spotify:track:x1')).toBeNull();
    expect(pathForUri(null)).toBeNull();
  });
});

describe('playlist shapes', () => {
  const track = { id: 't', name: 'T', uri: 'spotify:track:t', duration_ms: 1, artists: [] };
  it('reads both the 2026 and the older entry shape', () => {
    expect(entryTrack({ item: track })).toBe(track);
    expect(entryTrack({ track })).toBe(track);
    expect(entryTrack({})).toBeNull();
  });
  it('reads the track count from either field', () => {
    const base = { id: 'p', name: 'P', uri: 'u', owner: { id: 'o' } };
    expect(playlistCount({ ...base, items: { total: 3 } })).toBe(3);
    expect(playlistCount({ ...base, tracks: { total: 4 } })).toBe(4);
  });
});
