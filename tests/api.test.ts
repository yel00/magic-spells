import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real request code against a stand-in for Spotify's server.
const calls: string[] = [];
let respond: (url: URL) => { status: number; body: unknown };

beforeEach(() => {
  calls.length = 0;
  const store = new Map<string, string>([['ms.token', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3.6e6 })]]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  vi.stubGlobal('fetch', async (input: URL | string) => {
    const url = new URL(String(input));
    calls.push(url.pathname.replace('/v1', '') + url.search);
    const r = respond(url);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  });
});
afterEach(() => vi.unstubAllGlobals());

const album = (n: number, type: string) => ({ id: `${type}${n}`, name: `${type} ${n}`, uri: '', images: [], artists: [], album_type: type });

describe('artist albums', () => {
  it('never asks Spotify for more than ten at a time, and gathers the pages', async () => {
    const totals: Record<string, number> = { album: 23, single: 4 };
    respond = (url) => {
      const limit = Number(url.searchParams.get('limit'));
      if (limit > 10) return { status: 400, body: { error: { status: 400, message: 'Invalid limit' } } };
      const group = url.searchParams.get('include_groups')!;
      const offset = Number(url.searchParams.get('offset'));
      const items = Array.from({ length: Math.max(0, Math.min(limit, totals[group] - offset)) }, (_, i) => album(offset + i, group));
      return { status: 200, body: { items, total: totals[group], next: null } };
    };
    const { artistAlbums } = await import('../src/spotify/api');
    const r = await artistAlbums('artist1');
    expect(r.items.filter((a) => a.album_type === 'album')).toHaveLength(23);
    expect(r.items.filter((a) => a.album_type === 'single')).toHaveLength(4);
    expect(calls.every((c) => /limit=10(&|$)/.test(c))).toBe(true);
    expect(calls.filter((c) => c.includes('include_groups=album')).map((c) => /offset=(\d+)/.exec(c)![1]).sort()).toEqual(['0', '10', '20']);
    expect(calls.filter((c) => c.includes('include_groups=single'))).toHaveLength(1);
  });

  it('still shows albums when the singles request fails', async () => {
    respond = (url) =>
      url.searchParams.get('include_groups') === 'single'
        ? { status: 500, body: { error: { status: 500, message: 'Server error' } } }
        : { status: 200, body: { items: [album(0, 'album')], total: 1, next: null } };
    const { artistAlbums } = await import('../src/spotify/api');
    expect((await artistAlbums('artist1')).items.map((a) => a.id)).toEqual(['album0']);
  });
});

describe('page-size caps', () => {
  it('retries with ten when Spotify refuses a larger page', async () => {
    respond = (url) =>
      Number(url.searchParams.get('limit')) > 10
        ? { status: 400, body: { error: { status: 400, message: 'Invalid limit' } } }
        : { status: 200, body: { items: [{ id: 'p1' }], total: 1, next: null } };
    const { myPlaylists } = await import('../src/spotify/api');
    expect((await myPlaylists()).items).toHaveLength(1);
    expect(calls.map((c) => /limit=(\d+)/.exec(c)![1])).toEqual(['50', '10']);
  });

  it('does not retry other errors', async () => {
    respond = () => ({ status: 403, body: { error: { status: 403, message: 'Forbidden' } } });
    const { myPlaylists } = await import('../src/spotify/api');
    await expect(myPlaylists()).rejects.toThrow('Forbidden');
    expect(calls).toHaveLength(1);
  });
});
