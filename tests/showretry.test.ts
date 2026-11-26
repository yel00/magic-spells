// What "Your concerts" does when a sync attempt goes wrong: a bad moment on
// the network must not stop the list syncing for the rest of the session.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/spotify/auth', () => ({ getAccessToken: async () => 'token', isDemo: () => false }));
vi.mock('../src/shows/photos', () => ({ openPhotos: () => undefined, syncPhotos: async () => undefined }));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = () => json({ rev: 7, shows: [{ id: 'abc123', date: '2012-06-05', artist: { name: 'Wire', mbid: '' }, venue: 'Hall', city: 'Leeds', region: '', country: '', tour: '', info: '', url: '', songCount: 1, updated_at: 5, deleted: false }], place: null });

async function open(fetchMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.stubGlobal('fetch', fetchMock);
  const store = await import('../src/shows/store');
  store.openShows('user');
  await vi.advanceTimersByTimeAsync(0);
  return store;
}

describe('your concerts: recovering from a failed sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.unstubAllGlobals();
  });

  it('tries again by itself after the network drops a request', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('The network connection was lost.')).mockResolvedValue(ok());
    const { myShows } = await open(fetchMock);
    expect(myShows.get().synced).toBe('offline');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(myShows.get().synced).toBe('synced');
    expect(myShows.get().shows.map((s) => s.id)).toEqual(['abc123']);
  });

  it('does not give up for the session when the server answers with an error page', async () => {
    const errorPage = new Response('An error occurred with this application.\n\nFUNCTION_INVOCATION_TIMEOUT', { status: 504, headers: { 'content-type': 'text/plain' } });
    const fetchMock = vi.fn().mockResolvedValueOnce(errorPage).mockResolvedValue(ok());
    const { myShows } = await open(fetchMock);
    expect(myShows.get().synced).toBe('offline');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(myShows.get().synced).toBe('synced');
  });

  it('stops retrying after a few attempts while the network stays down', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    await open(fetchMock);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it('still treats a server with no database as not set up, and leaves it alone', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: 'Notes sync is not set up: add DATABASE_URL.' }, 501));
    const { myShows } = await open(fetchMock);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(myShows.get().synced).toBe('unconfigured');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
