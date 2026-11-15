// Hits the real MusicBrainz and Wikipedia services. Not part of CI: run with `npm run test:live`.
import { describe, expect, it } from 'vitest';
import { albumInfo, artistInfo } from '../src/enrich';

// MusicBrainz refuses clients with no identity. Browsers send one; Node's fetch does not.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  realFetch(input, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'magic-spells-tests/0.1 (personal project)' } });

const show = (label: string, v: unknown) => console.log(label, JSON.stringify(v, null, 1).slice(0, 1800));

describe('live lookups', () => {
  it('finds a well-known band', async () => {
    const a = await artistInfo('Radiohead');
    show('Radiohead', a);
    expect(a?.bio?.text).toMatch(/rock band/i);
    expect(a?.facts.join(' ')).toMatch(/1991|1985/);
    expect(a?.links.some((l) => l.label === 'Official site')).toBe(true);
  }, 60_000);

  it('finds a solo artist with an ambiguous name', async () => {
    const a = await artistInfo('Prince');
    show('Prince', { bio: a?.bio?.text.slice(0, 160), facts: a?.facts });
    expect(a?.bio?.text).toMatch(/singer|musician/i);
  }, 60_000);

  it('returns nothing for an artist that does not exist', async () => {
    expect(await artistInfo('Zxqv Nonexistent Band 93871')).toBeNull();
  }, 60_000);

  it('finds album credits despite edition noise in the title', async () => {
    const a = await albumInfo({ name: 'Rumours (Super Deluxe)', artist: 'Fleetwood Mac' });
    show('Rumours', a);
    expect(a?.about?.text).toMatch(/Fleetwood Mac/);
    expect(a?.credits.length).toBeGreaterThan(0);
  }, 120_000);

  it('finds a jazz album with many performers', async () => {
    const a = await albumInfo({ name: 'Kind of Blue', artist: 'Miles Davis' });
    show('Kind of Blue', { facts: a?.facts, credits: a?.credits });
    expect(a?.credits.find((g) => g.title === 'Performers')?.people.map((p) => p.name)).toContain('John Coltrane');
  }, 120_000);
});

describe('live discovery', () => {
  it('finds similar artists without any API key', async () => {
    const { similarArtists } = await import('../src/discover');
    const r = await similarArtists('Radiohead');
    show('similar to Radiohead', r);
    expect(r?.source).toBe('ListenBrainz');
    expect(r?.names.length).toBeGreaterThan(8);
    expect(r?.names).not.toContain('Radiohead');
  }, 60_000);

  it('returns nothing for an unknown artist', async () => {
    const { similarArtists } = await import('../src/discover');
    expect(await similarArtists('Zxqv Nonexistent Band 93871')).toBeNull();
  }, 60_000);
});

describe('live tempo and key lookup', () => {
  it('finds tempo and key for well-known recordings', async () => {
    const { trackAnalysis } = await import('../src/tools/lookup');
    const { keyName } = await import('../src/tools/keys');
    for (const [name, artist, durationMs] of [['Billie Jean', 'Michael Jackson', 294000], ['Around the World', 'Daft Punk', 429000], ['Smells Like Teen Spirit', 'Nirvana', 301000]] as const) {
      const r = await trackAnalysis({ name, artist, durationMs });
      console.log(name, '→', r && `${r.bpm} BPM, ${r.key ? keyName(r.key) : 'no key'}, ${r.samples} analyses`);
      expect(r?.bpm).toBeGreaterThan(40);
      await new Promise((res) => setTimeout(res, 1100));
    }
  }, 120_000);
});
