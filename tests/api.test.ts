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

describe('playlist editing', () => {
  it('moves an item within a list without losing or duplicating anything', async () => {
    const { moveItem } = await import('../src/views/Detail');
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('tells Spotify the same move the screen shows, in both directions', async () => {
    const { reorderParams } = await import('../src/spotify/api');
    const { moveItem } = await import('../src/views/Detail');
    // Apply Spotify's own rule to a list and compare with what the app displays.
    const spotify = (list: string[], p: { range_start: number; insert_before: number }) => {
      const next = list.slice();
      const [item] = next.splice(p.range_start, 1);
      next.splice(p.insert_before > p.range_start ? p.insert_before - 1 : p.insert_before, 0, item);
      return next;
    };
    const list = ['a', 'b', 'c', 'd', 'e'];
    for (const [from, to] of [[0, 1], [1, 0], [0, 4], [4, 0], [2, 3], [3, 2]]) {
      expect(spotify(list, reorderParams(from, to))).toEqual(moveItem(list, from, to));
    }
  });

  it('sends removals, renames and deletion in the shape Spotify now expects', async () => {
    const sent: { method: string; path: string; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
      const u = new URL(String(input));
      sent.push({ method: init?.method || 'GET', path: u.pathname.replace('/v1', '') + decodeURIComponent(u.search), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const api = await import('../src/spotify/api');
    await api.removeFromPlaylist('p1', ['spotify:track:a']);
    await api.updatePlaylist('p1', { name: 'New name', description: '' });
    await api.movePlaylistItem('p1', 0, 2);
    await api.deletePlaylist('spotify:playlist:p1');
    expect(sent).toEqual([
      { method: 'DELETE', path: '/playlists/p1/items', body: { items: [{ uri: 'spotify:track:a' }] } },
      { method: 'PUT', path: '/playlists/p1', body: { name: 'New name', description: '' } },
      { method: 'PUT', path: '/playlists/p1/items', body: { range_start: 0, insert_before: 3, range_length: 1 } },
      { method: 'DELETE', path: '/me/library?uris=spotify:playlist:p1', body: undefined },
    ]);
  });
});

describe('saving to the library', () => {
  it('puts the items in the address, never the body, forty at a time', async () => {
    const sent: { method: string; uris: string[]; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
      const u = new URL(String(input));
      sent.push({ method: init?.method || 'GET', uris: (u.searchParams.get('uris') || '').split(','), body: init?.body });
      return new Response(u.pathname.endsWith('/contains') ? '[true,false]' : '', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const api = await import('../src/spotify/api');
    await api.saveToLibrary(['spotify:track:a']);
    await api.removeFromLibrary(Array.from({ length: 45 }, (_, i) => `spotify:track:t${i}`));
    expect(await api.libraryContains(['spotify:track:a', 'spotify:track:b'])).toEqual([true, false]);
    expect(sent.map((s) => [s.method, s.uris.length, s.body])).toEqual([['PUT', 1, undefined], ['DELETE', 40, undefined], ['DELETE', 5, undefined], ['GET', 2, undefined]]);
    expect(sent[0].uris).toEqual(['spotify:track:a']);
  });
});
