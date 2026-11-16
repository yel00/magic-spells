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

describe('live cross-links', () => {
  it('finds a band’s members, and a producer’s credits', async () => {
    const { artistInfo, personInfo } = await import('../src/enrich');
    const { creditsFor } = await import('../src/enrich/discogs');
    const band = await artistInfo('Radiohead');
    console.log('members:', band?.members?.map((m) => `${m.name} (${m.detail})`).join('; '));
    expect(band?.members?.map((m) => m.name)).toContain('Thom Yorke');
    const thom = band!.members!.find((m) => m.name === 'Thom Yorke')!;
    const person = await personInfo(thom.mbid);
    console.log('Thom Yorke → member of:', person?.memberOf?.map((m) => m.name).join(', '), '| discogs', person?.discogsId, '| bio', person?.bio?.text.slice(0, 80));
    expect(person?.memberOf?.map((m) => m.name)).toContain('Radiohead');
    expect(person?.discogsId).toBeTruthy();
    const producer = await personInfo('~Nigel Godrich');
    const credits = await creditsFor(producer!.discogsId!);
    console.log('Godrich:', credits?.total, 'releases |', credits?.groups.map((g) => `${g.role} ${g.works.length}`).join(', '));
    console.log('produced sample:', credits?.groups.find((g) => g.role === 'Produced')?.works.slice(0, 6).map((w) => `${w.title} — ${w.artist} (${w.year})`).join(' | '));
    expect(credits?.groups.some((g) => g.role === 'Produced')).toBe(true);
  }, 180_000);
});

describe('live lyrics', () => {
  it('finds synced lyrics by exact match and by search', async () => {
    const { lyricsFor } = await import('../src/lyrics');
    const exact = await lyricsFor({ name: 'Karma Police', artist: 'Radiohead', album: 'OK Computer', durationMs: 264000 });
    console.log('exact:', exact?.synced, exact?.lines.length, JSON.stringify(exact?.lines.slice(0, 2)));
    expect(exact?.lines.length).toBeGreaterThan(10);
    const searched = await lyricsFor({ name: 'Karma Police - Remastered', artist: 'Radiohead', album: 'Some Compilation', durationMs: 264500 });
    console.log('search:', searched?.synced, searched?.lines.length);
    expect(searched?.lines.length).toBeGreaterThan(10);
    expect(await lyricsFor({ name: 'Zxqv Nonexistent Song 93871', artist: 'Nobody At All', durationMs: 200000 })).toBeNull();
  }, 60_000);
});

describe('live versions and reviews', () => {
  it('finds other recordings of a much-covered song', async () => {
    const { findWork, workPage, sortRecordings } = await import('../src/enrich/recordings');
    const work = await findWork({ name: 'Hallelujah', artist: 'Leonard Cohen' });
    console.log('work:', work?.id, 'total recordings', work?.total, 'first page', work?.first.length);
    expect(work?.total).toBeGreaterThan(100);
    const second = await workPage(work!.id, 1);
    const r = sortRecordings([...work!.first, ...second], 'Hallelujah', 'Leonard Cohen');
    console.log('covers after 2 pages:', r.byOthers.length, r.byOthers.slice(0, 8).map((x) => `${x.artist} ${x.year || ''}`).join(' | '));
    expect(second.length).toBeGreaterThan(50);
    expect(r.byOthers.length).toBeGreaterThan(20);
  }, 120_000);

  it('reads an album’s reception from Wikipedia', async () => {
    const { receptionFor } = await import('../src/enrich/reception');
    const r = await receptionFor('https://en.m.wikipedia.org/wiki/Rumours_(album)');
    console.log('Rumours:', r?.url, '|', r?.tables.map((t) => `${t.title}: ${t.ratings.length} ratings, ${t.aggregate.length} agg`).join('; '), '|', r?.paragraphs[0]?.slice(0, 140));
    expect(r?.tables.length).toBeGreaterThan(0);
    expect(r?.paragraphs.length).toBeGreaterThan(0);
    const modern = await receptionFor('https://en.wikipedia.org/wiki/In_Rainbows');
    console.log('In Rainbows:', JSON.stringify(modern?.tables[0]?.aggregate), modern?.tables[0]?.ratings.length);
  }, 120_000);
});

describe('live samples', () => {
  it('finds a famous sample in MusicBrainz', async () => {
    const { mbSamples } = await import('../src/enrich/borrowings');
    for (const [name, artist] of [['Ice Ice Baby', 'Vanilla Ice'], ['Stronger', 'Kanye West']] as const) {
      const r = await mbSamples({ name, artist });
      console.log(name, '→ samples:', JSON.stringify(r?.samples.slice(0, 4)), '| sampled by:', r?.sampledBy.length);
    }
  }, 120_000);
});

describe('live artwork', () => {
  it('finds an album’s extra artwork', async () => {
    const { albumArtwork } = await import('../src/enrich/artwork');
    const pics = await albumArtwork('76df3287-6cda-33eb-8e9a-044b5e15ffdd');
    console.log('artwork:', pics?.map((p) => p.label).join(' | '), '|', pics?.[1]?.full);
    expect(pics?.length).toBeGreaterThan(2);
    expect(await albumArtwork('00000000-0000-4000-8000-000000000000')).toBeNull();
  }, 60_000);
});

describe('live posters', () => {
  it('finds posters for an artist who has some, and nothing for one who has none', async () => {
    const { artistPosters } = await import('../src/enrich/posters');
    // An artist with a gig that is known to have a poster on file.
    const found = await artistPosters('a0644021-9bcb-4af0-bea4-15bdd426564f');
    console.log('posters for Ivy Blue:', found?.length, found?.slice(0, 3).map((p) => p.label).join(' | '), '|', found?.[0]?.thumb);
    expect(found?.length).toBeGreaterThan(0);
    const none = await artistPosters('a74b1b7f-71a5-4011-9441-d0b5e4122711');
    console.log('posters for Radiohead:', none?.length ?? 0);
  }, 180_000);
});
