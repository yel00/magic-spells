import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the server function
import { pickHit, shapeSong } from '../api/_lib/genius.js';
import { albumFacts, artistFacts, creditsFrom, linksFrom } from '../src/enrich/musicbrainz';
import { cleanTitle, listNames, norm, sameName } from '../src/enrich/text';

describe('title cleaning', () => {
  it('strips edition noise but keeps real subtitles', () => {
    expect(cleanTitle('Rumours (Super Deluxe)')).toBe('Rumours');
    expect(cleanTitle('Paranoid Android - Remastered')).toBe('Paranoid Android');
    expect(cleanTitle('Heroes - 2017 Remaster')).toBe('Heroes');
    expect(cleanTitle('Stan (feat. Dido)')).toBe('Stan');
    expect(cleanTitle('(What’s the Story) Morning Glory?')).toBe('(What’s the Story) Morning Glory?');
    expect(cleanTitle('Symphony No. 5 - Allegro')).toBe('Symphony No. 5 - Allegro');
  });
  it('compares names across catalogues', () => {
    expect(sameName('Beyoncé', 'beyonce')).toBe(true);
    expect(sameName('Simon & Garfunkel', 'Simon and Garfunkel')).toBe(true);
    expect(norm('AC/DC')).toBe('ac dc');
    expect(listNames(['a', 'b', 'c'], 2)).toBe('a, b and 1 more');
  });
});

describe('MusicBrainz shaping', () => {
  it('describes a band and a person differently', () => {
    expect(artistFacts({ type: 'Group', 'life-span': { begin: '1991', end: '2001-05' }, area: { name: 'UK' }, 'begin-area': { name: 'Leeds' } })).toEqual(['Formed 1991', 'Disbanded 2001', 'Leeds, UK', 'Group']);
    expect(artistFacts({ type: 'Person', 'life-span': { begin: '1958-06-07' }, area: { name: 'US' } })).toEqual(['Born 1958', 'US']);
  });
  it('labels links, finds the Wikidata id and skips dead links', () => {
    const r = linksFrom([
      { type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q44190' } },
      { type: 'social network', url: { resource: 'https://www.instagram.com/x/' } },
      { type: 'official homepage', url: { resource: 'https://x.example/' } },
      { type: 'official homepage', ended: true, url: { resource: 'https://old.example/' } },
      { type: 'other', url: { resource: 'https://unknown.example/' } },
    ]);
    expect(r.wikidata).toBe('Q44190');
    expect(r.links).toEqual([{ label: 'Official site', url: 'https://x.example/' }, { label: 'Instagram', url: 'https://www.instagram.com/x/' }]);
  });
  it('folds per-track relationships into album credits', () => {
    const rel = (type: string, name: string, attributes: string[] = []) => ({ type, 'target-type': 'artist', artist: { name }, attributes });
    const release = {
      relations: [rel('producer', 'Pat', ['executive']), rel('photography', 'Sam')],
      media: [{ tracks: [
        { recording: { relations: [rel('instrument', 'Ann', ['guitar']), rel('vocal', 'Ann', ['lead vocals']), rel('mix', 'Lee'),
          { type: 'performance', 'target-type': 'work', work: { relations: [rel('composer', 'Ann'), rel('lyricist', 'Bo')] } }] } },
        { recording: { relations: [rel('instrument', 'Ann', ['guitar']), rel('instrument', 'Cy', ['drums (drum set)'])] } },
      ] }],
    };
    const groups = creditsFrom(release);
    expect(groups.map((g) => g.title)).toEqual(['Performers', 'Written by', 'Produced by', 'Engineering & arrangement', 'Artwork']);
    expect(groups[0].people).toEqual([{ name: 'Ann', detail: 'guitar, lead vocals' }, { name: 'Cy', detail: 'drums' }]);
    expect(groups[1].people.map((p) => p.name)).toEqual(['Ann', 'Bo']);
    expect(groups[2].people).toEqual([{ name: 'Pat', detail: 'executive producer' }]);
    expect(groups[3].people).toEqual([{ name: 'Lee', detail: 'mixing' }]);
  });
  it('reads label facts', () => {
    expect(albumFacts({ 'label-info': [{ label: { name: 'Columbia' }, 'catalog-number': 'CL 1355' }, { label: { name: 'Columbia' } }], 'release-group': { 'first-release-date': '1959-08-17' } }))
      .toEqual(['Columbia', 'Cat. CL 1355', 'First released 1959']);
  });
});

describe('Genius matching', () => {
  const hit = (title: string, artist: string, id = 1) => ({ type: 'song', result: { id, title, primary_artist: { name: artist }, artist_names: artist } });
  it('accepts the right song and refuses near misses', () => {
    const hits = [hit('Creep (Acoustic) Translation', 'Genius Translations', 9), hit('Creep', 'Radiohead', 2)];
    expect(pickHit(hits, 'Creep', 'Radiohead').id).toBe(2);
    expect(pickHit([hit('Creep', 'TLC')], 'Creep', 'Radiohead')).toBeNull();
    expect(pickHit([hit('Creeping Death', 'Radiohead')], 'Creep', 'Radiohead')).toBeNull();
    expect(pickHit([], 'Creep', 'Radiohead')).toBeNull();
  });
  it('shapes a song and drops an empty description', () => {
    const s = shapeSong({
      url: 'u', title: 'T', primary_artist: { name: 'A' }, description: { plain: '?' }, release_date_for_display: 'May 1, 2000',
      writer_artists: [{ name: 'W' }], producer_artists: [{ name: 'P' }],
      song_relationships: [{ relationship_type: 'samples', songs: [{ title: 'Old', primary_artist: { name: 'O' }, url: 'o' }] }, { relationship_type: 'translations', songs: [{ title: 'x' }] }, { relationship_type: 'covered_by', songs: [] }],
    });
    expect(s).toEqual({ url: 'u', title: 'T', artist: 'A', description: undefined, released: 'May 1, 2000', writers: ['W'], producers: ['P'], related: [{ label: 'Samples', songs: [{ title: 'Old', artist: 'O', url: 'o' }] }] });
  });
});

describe('lookup cache', () => {
  it('remembers good answers but not provisional ones', async () => {
    const { cached, Provisional } = await import('../src/enrich/cache');
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
    let calls = 0;
    const good = () => cached('k1', async () => (calls++, 'value'));
    expect(await good()).toBe('value');
    expect(await good()).toBe('value');
    expect(calls).toBe(1);

    let flakyCalls = 0;
    const flaky = () => cached<string>('k2', async () => { flakyCalls++; throw new Provisional('partial'); });
    expect(await flaky()).toBe('partial');
    expect(await flaky()).toBe('partial');
    expect(flakyCalls).toBe(2);

    await expect(cached('k3', async () => { throw new Error('down'); })).rejects.toThrow('down');
    delete (globalThis as any).localStorage;
  });
});
