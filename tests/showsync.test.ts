import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS server module
import { cleanPlace, cleanShow, readPhotoId, SCHEMA, syncPlace, syncShows } from '../api/_lib/shows.js';
import { adopt, live, markSent, mergeShows, type LocalShow, type MarkedShow } from '../src/shows/merge';
import { planPhotoSync } from '../src/shows/photos';

const show = (id: string, at: number, extra: Partial<LocalShow> = {}): LocalShow => ({
  id, date: '2012-06-05', artist: { name: 'Wire', mbid: '' }, venue: 'Hall', city: 'Leeds', region: '', country: 'United Kingdom', tour: '', info: '', url: '', songCount: 12, updated_at: at, deleted: false, ...extra,
});
const strip = ({ dirty: _d, ...s }: LocalShow): MarkedShow => s;

describe('shows you were at: merging', () => {
  it('adopts a list saved before syncing existed as changes to send', () => {
    const [a, b] = adopt([{ id: 'abc123', venue: 'Hall' }, show('def456', 5)], 99);
    expect(a).toMatchObject({ id: 'abc123', updated_at: 99, deleted: false, dirty: true });
    expect(b.dirty).toBeUndefined();
    expect(adopt(null, 1)).toEqual([]);
  });

  it('keeps the newer edit and hides un-marked shows', () => {
    const local = [show('aaaaaa', 10, { dirty: true }), show('bbbbbb', 10)];
    const merged = mergeShows(local, [show('aaaaaa', 5, { deleted: true }), show('bbbbbb', 20, { deleted: true }), show('cccccc', 1)]);
    expect(merged.find((s) => s.id === 'aaaaaa')).toMatchObject({ deleted: false, dirty: true });
    expect(live(merged).map((s) => s.id).sort()).toEqual(['aaaaaa', 'cccccc']);
    expect(live(merged)[0]).not.toHaveProperty('updated_at');
  });

  it('only clears the mark on what was actually sent', () => {
    const sent = [strip(show('aaaaaa', 10))];
    expect(markSent([show('aaaaaa', 10, { dirty: true })], sent)[0].dirty).toBe(false);
    expect(markSent([show('aaaaaa', 11, { dirty: true })], sent)[0].dirty).toBe(true);
  });
});

describe('shows you were at: what the server accepts', () => {
  it('cleans a show and refuses nonsense', () => {
    expect(cleanShow(show('63de4613', 5, { url: 'https://www.setlist.fm/setlist/x.html' }))).toMatchObject({ id: '63de4613', venue: 'Hall', songCount: 12, url: 'https://www.setlist.fm/setlist/x.html' });
    expect(cleanShow(show('63de4613', 5, { url: 'javascript:alert(1)', date: 'soon', songCount: -3 }))).toMatchObject({ url: '', date: '', songCount: 0 });
    expect(cleanShow(show('../etc', 5))).toBeNull();
    expect(cleanShow({ ...show('63de4613', 5), updated_at: 'now' })).toBeNull();
    expect(cleanShow(null)).toBeNull();
  });

  it('cleans a concert area', () => {
    expect(cleanPlace({ name: 'Leeds', lat: 53.8, lon: -1.5, radius: 50, extra: 1 })).toEqual({ name: 'Leeds', lat: 53.8, lon: -1.5, radius: 50 });
    expect(cleanPlace(null)).toBeNull();
    expect(cleanPlace({ name: 'Leeds', lat: 153, lon: 0, radius: 50 })).toBeUndefined();
    expect(cleanPlace({ name: '', lat: 1, lon: 1, radius: 5 })).toBeUndefined();
    expect(cleanPlace('Leeds')).toBeUndefined();
  });

  it('reads the show out of a picture id', () => {
    expect(readPhotoId('63de4613:1763400000000:ab12cd')).toEqual({ id: '63de4613:1763400000000:ab12cd', showId: '63de4613' });
    expect(readPhotoId('63de4613:1763400000000:../x')).toBeNull();
    expect(readPhotoId(undefined)).toBeNull();
  });
});

describe('picture sync plan', () => {
  const remote = (id: string, deleted = false) => ({ id, show_id: 'aaaaaa', added: 1, deleted });
  it('sends new pictures, fetches missing ones and drops removed ones', () => {
    const plan = planPhotoSync([{ id: 'new' }, { id: 'both' }, { id: 'removed-elsewhere', synced: true }], [remote('both'), remote('removed-elsewhere', true), remote('theirs'), remote('long-gone', true)], []);
    expect(plan).toEqual({ drop: ['removed-elsewhere'], fetch: [remote('theirs')], send: ['new'], markSynced: ['both'] });
  });
  it('does not fetch back a picture just removed here', () => {
    expect(planPhotoSync([], [remote('x')], ['x']).fetch).toEqual([]);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('concert sync against Postgres', () => {
  let db: pg.Pool;
  beforeAll(async () => {
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await db.query('DROP TABLE IF EXISTS my_shows, prefs, show_photos; DROP SEQUENCE IF EXISTS shows_rev;');
    await db.query(SCHEMA);
    await db.query(SCHEMA);
  });
  afterAll(() => db.end());

  it('hands shows to a second device and sends only what changed', async () => {
    const phone = await syncShows(db, 'alice', 0, [strip(show('aaaaaa', 10)), strip(show('bbbbbb', 10)), { id: 'bad id' }]);
    expect(phone.shows.map((s: MarkedShow) => s.id).sort()).toEqual(['aaaaaa', 'bbbbbb']);
    const desktop = await syncShows(db, 'alice', 0, []);
    expect(desktop.shows).toHaveLength(2);
    expect(desktop.shows[0]).toMatchObject({ venue: 'Hall', artist: { name: 'Wire' }, deleted: false });
    expect(await syncShows(db, 'alice', desktop.rev, [])).toEqual({ rev: desktop.rev, shows: [] });
    expect((await syncShows(db, 'bob', 0, [])).shows).toEqual([]);
  });

  it('lets the newer edit win, including un-marking', async () => {
    await syncShows(db, 'carol', 0, [strip(show('aaaaaa', 100))]);
    await syncShows(db, 'carol', 0, [strip(show('aaaaaa', 50, { deleted: true }))]);
    expect((await syncShows(db, 'carol', 0, [])).shows[0].deleted).toBe(false);
    await syncShows(db, 'carol', 0, [strip(show('aaaaaa', 200, { deleted: true }))]);
    expect((await syncShows(db, 'carol', 0, [])).shows[0].deleted).toBe(true);
  });

  it('keeps the most recently chosen concert area', async () => {
    const leeds = { name: 'Leeds', lat: 53.8, lon: -1.5, radius: 50 };
    const york = { name: 'York', lat: 53.9, lon: -1.1, radius: 25 };
    expect(await syncPlace(db, 'dave', undefined)).toBeNull();
    expect(await syncPlace(db, 'dave', { value: leeds, updated_at: 100 })).toEqual({ value: leeds, updated_at: 100 });
    expect(await syncPlace(db, 'dave', { value: york, updated_at: 50 })).toEqual({ value: leeds, updated_at: 100 });
    expect(await syncPlace(db, 'dave', { value: york, updated_at: 150 })).toEqual({ value: york, updated_at: 150 });
    expect(await syncPlace(db, 'dave', { value: { name: 'x', lat: 999, lon: 0, radius: 1 }, updated_at: 900 })).toEqual({ value: york, updated_at: 150 });
    expect(await syncPlace(db, 'dave', { value: null, updated_at: 200 })).toEqual({ value: null, updated_at: 200 });
  });

  describe('pictures, end to end through the request handler', () => {
    const files = new Map<string, Buffer>();
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
    let handler: (req: any, res: any) => Promise<unknown>;

    beforeAll(async () => {
      vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
      vi.doMock('@vercel/blob', () => ({
        put: async (pathname: string, body: Buffer, o: { access: string }) => {
          if (o.access === 'private') throw new Error('this store is public');
          const name = `${pathname}-rnd`;
          files.set(name, body);
          return { pathname: name, url: `https://blob.example/${name}` };
        },
        get: async (pathname: string) => (files.has(pathname) ? { stream: new Blob([new Uint8Array(files.get(pathname)!)]).stream() } : null),
        del: async (names: string[]) => names.forEach((n) => files.delete(n)),
      }));
      // Spotify says who each token belongs to.
      vi.stubGlobal('fetch', async (_url: string, init: any) => {
        const who = String(init.headers.Authorization).replace('Bearer token-of-', '');
        return who === 'nobody' ? new Response('', { status: 401 }) : Response.json({ id: who });
      });
      // @ts-expect-error plain JS server module
      handler = (await import('../api/photos.js')).default as typeof handler;
    });
    afterAll(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    beforeEach(() => db.query('DELETE FROM show_photos'));

    const call = async (method: string, who: string, query: Record<string, string> = {}, body?: unknown) => {
      const out: { status: number; body?: any; headers: Record<string, string> } = { status: 0, headers: {} };
      const res = {
        setHeader: (k: string, v: string) => { out.headers[k] = v; },
        status(code: number) { out.status = code; return this; },
        json(v: unknown) { out.body = v; return this; },
        send(v: unknown) { out.body = v; return this; },
      };
      await handler({ method, query, body, headers: { authorization: `Bearer token-of-${who}` } }, res);
      return out;
    };
    const id = 'aaaaaa:1763400000000:ab12cd';

    it('stores a picture, lists it, returns it only to its owner, and removes it everywhere', async () => {
      expect((await call('PUT', 'erin', { id, added: '1763400000000' }, jpeg)).status).toBe(200);
      expect((await call('PUT', 'erin', { id }, jpeg)).status).toBe(200); // sending twice is harmless
      expect(files.size).toBe(1);

      expect((await call('POST', 'erin', {}, {})).body.photos).toEqual([{ id, show_id: 'aaaaaa', added: 1763400000000, deleted: false }]);
      const got = await call('GET', 'erin', { id });
      expect(got.status).toBe(200);
      expect(Buffer.compare(got.body, jpeg)).toBe(0);
      expect(got.headers['Content-Type']).toBe('image/jpeg');

      expect((await call('GET', 'frank', { id })).status).toBe(404);
      expect((await call('POST', 'frank', {}, { deleted: [id] })).body.photos).toEqual([]);
      expect(files.size).toBe(1);

      expect((await call('POST', 'erin', {}, { deleted: [id] })).body.photos).toEqual([{ id, show_id: 'aaaaaa', added: 1763400000000, deleted: true }]);
      expect(files.size).toBe(0);
      expect((await call('GET', 'erin', { id })).status).toBe(404);
    });

    it('refuses strangers, bad ids and things that are not pictures', async () => {
      expect((await call('POST', 'nobody', {}, {})).status).toBe(401);
      expect((await call('PUT', 'erin', { id: '../../etc' }, jpeg)).status).toBe(400);
      expect((await call('PUT', 'erin', { id }, Buffer.from('<script>alert(1)</script>'))).status).toBe(400);
      expect((await call('PUT', 'erin', { id }, Buffer.alloc(4_000_001, 0xff))).status).toBe(413);
      expect(files.size).toBe(0);
    });
  });
});
