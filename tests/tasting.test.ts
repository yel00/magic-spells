import { beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain JS modules shared with the server function
import { buildPrompt, cleanRequest, isAllowed, SYSTEM, takeQuota, TastingSchema } from '../api/_lib/tasting.js';
import { matchPick, playlistDescription, seedChoices } from '../src/tasting/logic';
import type { Track } from '../src/spotify/types';
import type { Pick } from '../src/tasting/types';

const track = (id: string, name: string, artist: string): Track => ({ id, name, uri: `spotify:track:${id}`, duration_ms: 1, artists: [{ id: artist, name: artist, uri: '' }] });
const pick = (title: string, artist: string): Pick => ({ title, artist, genre: 'g', year: '', familiarity: 'deep cut', shares: 's', why: 'w', listen_for: [] });
const guide = {
  title: 'Bass up front', summary: 'Both songs let the bass carry the tune.',
  shared: [{ feature: 'Melodic bass', description: 'The bass plays the hook.' }],
  picks: [{ title: 'Song A', artist: 'Artist A', genre: 'Highlife', year: '1975', familiarity: 'deep cut', shares: 'Melodic bass', why: 'Because.', listen_for: ['The bass at the start.'] }],
};

describe('what the app sends', () => {
  it('accepts a normal request and bounds every field', () => {
    const r = cleanRequest({ seeds: [{ title: ' Karma  Police ', artist: 'Radiohead', album: 'OK Computer', year: '1997-05' }, { title: '', artist: 'x' }], note: 'x'.repeat(900), count: 9 });
    expect(r.seeds).toEqual([{ title: 'Karma Police', artist: 'Radiohead', album: 'OK Computer', year: '1997' }]);
    expect(r.note).toHaveLength(400);
    expect(r.count).toBe(5);
    expect(cleanRequest({ seeds: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, artist: 'a' })) }).seeds).toHaveLength(8);
  });
  it('rejects a request with nothing to start from', () => {
    expect(cleanRequest({ seeds: [] })).toBeNull();
    expect(cleanRequest({ seeds: [{ title: 'only a title' }] })).toBeNull();
    expect(cleanRequest(null)).toBeNull();
  });
  it('writes the songs, the listener’s own words and the number wanted into the prompt', () => {
    const p = buildPrompt({ seeds: [{ title: 'Karma Police', artist: 'Radiohead', album: 'OK Computer', year: '1997' }, { title: 'Teardrop', artist: 'Massive Attack', album: '', year: '' }], note: 'the slow build', count: 4 });
    expect(p).toContain('1. "Karma Police" by Radiohead, from OK Computer (1997)');
    expect(p).toContain('2. "Teardrop" by Massive Attack');
    expect(p).toContain('What I think I like about them: the slow build');
    expect(p).toContain('6 candidate songs');
    expect(buildPrompt({ seeds: [{ title: 'T', artist: 'A' }], note: '', count: 3 })).not.toContain('What I think');
  });
  it('the answer shape accepts a well-formed flight and rejects a malformed one', () => {
    expect(TastingSchema.safeParse(guide).success).toBe(true);
    expect(TastingSchema.safeParse({ ...guide, picks: [{ title: 'x' }] }).success).toBe(false);
    expect(SYSTEM).toContain('different genre');
  });
});

describe('who may spend the AI credit', () => {
  it('lets anyone in when no list is set, and only listed accounts when one is', () => {
    expect(isAllowed('alice', '')).toBe(true);
    expect(isAllowed('alice', undefined)).toBe(true);
    expect(isAllowed('alice', 'alice, bob')).toBe(true);
    expect(isAllowed('carol', 'alice, bob')).toBe(false);
  });
  it('caps sessions per person per day and starts fresh the next day', () => {
    const used = new Map();
    const monday = Date.UTC(2026, 10, 16, 12);
    expect([1, 2, 3].map(() => takeQuota(used, 'alice', monday, 2))).toEqual([true, true, false]);
    expect(takeQuota(used, 'bob', monday, 2)).toBe(true);
    expect(takeQuota(used, 'alice', monday + 86_400_000, 2)).toBe(true);
    expect(used.size).toBe(1);
  });
});

describe('checking picks against Spotify', () => {
  const results = [track('1', 'Teardrop - Remastered 2019', 'Massive Attack'), track('2', 'Teardrop', 'Some Cover Band'), track('3', 'Tear', 'Massive Attack')];
  it('finds the song by the named artist, ignoring edition wording', () => {
    expect(matchPick(results, pick('Teardrop', 'Massive Attack'))?.id).toBe('1');
    expect(matchPick(results, pick('teardrop', 'massive attack'))?.id).toBe('1');
  });
  it('refuses a cover, a different song by the same artist, or a song that isn’t there', () => {
    expect(matchPick(results.slice(1), pick('Teardrop', 'Massive Attack'))).toBeNull();
    expect(matchPick(results, pick('A Song That Does Not Exist', 'Massive Attack'))).toBeNull();
    expect(matchPick([], pick('Teardrop', 'Massive Attack'))).toBeNull();
  });
  it('offers varied starting songs: no repeats, at most two per artist', () => {
    const lists = [[track('a1', 'One', 'A'), track('a2', 'Two', 'A'), track('a3', 'Three', 'A')], [track('a1b', 'One - Live', 'A'), track('b1', 'Solo', 'B')]];
    expect(seedChoices(lists).map((t) => t.id)).toEqual(['a1', 'a2', 'b1']);
  });
  it('keeps the playlist description inside Spotify’s limit', () => {
    const d = playlistDescription('word '.repeat(100), [{ title: 'A', artist: 'x' }, { title: 'B', artist: 'y' }]);
    expect(d.length).toBeLessThanOrEqual(300);
    expect(d.startsWith('A tasting flight built from A, B.')).toBe(true);
    expect(d.endsWith('…')).toBe(true);
  });
});

// The server function, run for real against stand-ins for Spotify and the AI service.
describe('the server function', () => {
  let handler: (req: any, res: any) => Promise<unknown>;
  let ai: (body: any, headers: Headers) => { status: number; body: unknown };
  let sent: { body: any; headers: Headers; url: string } | null = null;

  beforeAll(async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubGlobal('fetch', async (input: any, init?: any) => {
      const url = String(typeof input === 'string' || input instanceof URL ? input : input.url);
      const headers = new Headers(init?.headers || (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
      if (url.includes('api.spotify.com')) {
        const ok = headers.get('authorization') === 'Bearer good';
        return new Response(JSON.stringify(ok ? { id: 'alice' } : { error: 'bad' }), { status: ok ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
      }
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : await input.text());
      sent = { body, headers, url };
      const r = ai(body, headers);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json', 'request-id': 'req_test' } });
    });
    // @ts-expect-error plain JS server function
    handler = (await import('../api/tasting.js')).default;
  });

  const call = async (over: any = {}) => {
    const res: any = { code: 0, data: null, setHeader() {}, status(c: number) { this.code = c; return this; }, json(d: unknown) { this.data = d; return this; } };
    await handler({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { seeds: [{ title: 'Karma Police', artist: 'Radiohead' }], count: 3 }, ...over }, res);
    return res as { code: number; data: any };
  };
  const message = (over: any = {}) => ({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
    content: [{ type: 'text', text: JSON.stringify(guide) }], usage: { input_tokens: 10, output_tokens: 10 }, ...over,
  });

  it('asks the model for a structured flight and returns it', async () => {
    ai = () => ({ status: 200, body: message() });
    const res = await call();
    expect(res.code).toBe(200);
    expect(res.data).toEqual(guide);
    expect(sent!.url).toContain('/v1/messages');
    expect(sent!.body.model).toBe('claude-opus-5-5');
    expect(sent!.body.fallbacks).toBe('default');
    expect(sent!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(sent!.body.output_config.effort).toBe('medium');
    expect(sent!.body.output_config.format.type).toBe('json_schema');
    expect(sent!.body.thinking).toBeUndefined();
    expect(sent!.body.temperature).toBeUndefined();
    expect(sent!.body.messages).toEqual([{ role: 'user', content: expect.stringContaining('"Karma Police" by Radiohead') }]);
    expect(sent!.body.messages[0].content).toContain('5 candidate songs');
    // The key travels in a credential header, never in the request body.
    expect(sent!.headers.get('x-api-key') ?? sent!.headers.get('authorization')).toContain('test-key');
    expect(JSON.stringify(sent!.body)).not.toContain('test-key');
  });

  it('turns each kind of failure into a plain message, without leaking details', async () => {
    ai = () => ({ status: 200, body: message({ stop_reason: 'refusal', content: [] }) });
    expect((await call()).code).toBe(422);
    ai = () => ({ status: 200, body: message({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"title": "cut off' }] }) });
    expect((await call()).code).toBe(502);
    ai = () => ({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
    expect(await call()).toMatchObject({ code: 501, data: { error: 'The Anthropic API key was rejected.' } });
    ai = () => ({ status: 429, body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } } });
    expect((await call()).code).toBe(429);
    ai = () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'internal detail' } } });
    const res = await call();
    expect(res.code).toBe(502);
    expect(JSON.stringify(res.data)).not.toContain('internal detail');
  });

  it('refuses callers who are not signed in, and requests with no songs, before spending anything', async () => {
    sent = null;
    ai = () => ({ status: 200, body: message() });
    expect((await call({ headers: {} })).code).toBe(401);
    expect((await call({ headers: { authorization: 'Bearer stolen' } })).code).toBe(401);
    expect((await call({ body: { seeds: [] } })).code).toBe(400);
    expect((await call({ method: 'GET' })).code).toBe(405);
    expect(sent).toBeNull();
  });

  it('honours the allow-list', async () => {
    vi.stubEnv('AI_ALLOWED_USERS', 'bob');
    sent = null;
    expect((await call()).code).toBe(403);
    expect(sent).toBeNull();
    vi.stubEnv('AI_ALLOWED_USERS', 'alice,bob');
    expect((await call()).code).toBe(200);
    vi.stubEnv('AI_ALLOWED_USERS', '');
  });

  it('says so when no key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect((await call()).code).toBe(501);
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  });
});
