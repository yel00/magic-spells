import { describe, expect, it } from 'vitest';
import { edgesAmong, recommend, type SimilarList } from '../src/map/graph';
import { clusters, labelBox, layout, type MapEdge, type MapNode } from '../src/map/layout';

const node = (id: string, size = 0.5, pinned = false): MapNode => ({ id, label: id, size, pinned });
const dist = (p: Map<string, { x: number; y: number }>, a: string, b: string) => Math.hypot(p.get(a)!.x - p.get(b)!.x, p.get(a)!.y - p.get(b)!.y);

describe('map layout', () => {
  const nodes = [node('centre', 1, true), ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => node(id))];
  const edges: MapEdge[] = [
    { a: 'centre', b: 'a', w: 0.95 }, { a: 'centre', b: 'b', w: 0.9 }, { a: 'centre', b: 'c', w: 0.3 }, { a: 'centre', b: 'd', w: 0.2 },
    { a: 'a', b: 'b', w: 0.9 }, { a: 'e', b: 'f', w: 0.9 }, { a: 'f', b: 'g', w: 0.9 }, { a: 'e', b: 'g', w: 0.9 },
  ];
  const pos = layout(nodes, edges);

  it('keeps the centre in the middle and puts closer matches nearer to it', () => {
    expect(pos.get('centre')).toEqual({ x: 0, y: 0 });
    expect(dist(pos, 'centre', 'a')).toBeLessThan(dist(pos, 'centre', 'c'));
    expect(dist(pos, 'centre', 'b')).toBeLessThan(dist(pos, 'centre', 'd'));
  });
  it('pulls a tight group together, away from artists it has no link to', () => {
    const inside = Math.max(dist(pos, 'e', 'f'), dist(pos, 'f', 'g'), dist(pos, 'e', 'g'));
    expect(inside).toBeLessThan(dist(pos, 'e', 'a'));
    expect(inside).toBeLessThan(dist(pos, 'g', 'h'));
  });
  it('gives the same map every time and never produces a broken position', () => {
    expect([...layout(nodes, edges)]).toEqual([...pos]);
    for (const p of pos.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
  it('leaves no two names overlapping, even on a crowded map', () => {
    const many = [node('centre', 1, true), ...Array.from({ length: 60 }, (_, i) => node(`Artist Number ${i}`, (i % 5) / 5))];
    const links = many.slice(1).map((n, i) => ({ a: 'centre', b: n.id, w: 1 - i / 70 }));
    const p = layout(many, links);
    let overlaps = 0;
    for (let i = 0; i < many.length; i++) {
      for (let j = i + 1; j < many.length; j++) {
        const [a, b] = [labelBox(many[i]), labelBox(many[j])];
        const [pa, pb] = [p.get(many[i].id)!, p.get(many[j].id)!];
        if (Math.abs(pa.x - pb.x) < (a.w + b.w) / 2 - 1 && Math.abs(pa.y - pb.y) < (a.h + b.h) / 2 - 1) overlaps++;
      }
    }
    expect(overlaps).toBe(0);
  });
  it('copes with one artist, or none', () => {
    expect(layout([], []).size).toBe(0);
    expect(layout([node('solo', 1, true)], []).get('solo')).toEqual({ x: 0, y: 0 });
  });
});

describe('neighbourhoods', () => {
  it('groups tightly linked artists and numbers the biggest group first', () => {
    const nodes = ['a', 'b', 'c', 'd', 'x', 'y', 'lone'].map((id) => node(id));
    const edges: MapEdge[] = [
      { a: 'a', b: 'b', w: 0.9 }, { a: 'b', b: 'c', w: 0.9 }, { a: 'a', b: 'c', w: 0.9 }, { a: 'c', b: 'd', w: 0.8 },
      { a: 'x', b: 'y', w: 0.9 }, { a: 'd', b: 'x', w: 0.1 },
    ];
    const g = clusters(nodes, edges);
    expect(new Set(['a', 'b', 'c', 'd'].map((id) => g.get(id))).size).toBe(1);
    expect(g.get('x')).toBe(g.get('y'));
    expect(g.get('a')).not.toBe(g.get('x'));
    expect(g.get('a')).toBe(0);
    expect(g.get('lone')).not.toBe(g.get('a'));
  });
});

describe('recommendations', () => {
  const list = (of: string, names: string[], weights: number[]): SimilarList => ({ of, result: { source: 't', names, weights } });
  const lists = [
    list('Radiohead', ['Thom Yorke', 'Portishead', 'Muse', 'Blur'], [0.9, 0.6, 0.5, 0.4]),
    list('Massive Attack', ['Portishead', 'Tricky', 'Radiohead'], [0.95, 0.8, 0.3]),
    list('Björk', ['Portishead', 'Tricky', 'Thom Yorke'], [0.5, 0.4, 0.3]),
    { of: 'Unknown', result: null },
  ];
  const known = new Set(['radiohead', 'massive attack', 'bjork', 'blur']);
  const recs = recommend(lists, known);

  it('ranks artists close to several of yours above those close to one', () => {
    expect(recs.map((r) => r.name)).toEqual(['Portishead', 'Tricky', 'Thom Yorke']);
    expect(recs[0].because.map((b) => b.name)).toEqual(['Massive Attack', 'Radiohead', 'Björk']);
  });
  it('never recommends an artist you already have, or one near only a single artist of yours', () => {
    expect(recs.some((r) => ['Radiohead', 'Blur'].includes(r.name))).toBe(false);
    expect(recs.some((r) => r.name === 'Muse')).toBe(false);
  });
  it('links your artists to each other, keeping the stronger of two opinions', () => {
    const edges = edgesAmong(lists, new Set(['radiohead', 'massive attack', 'bjork']));
    expect(edges).toEqual([{ a: 'massive attack', b: 'radiohead', w: 0.3 }]);
    const both = edgesAmong([list('A', ['B'], [0.2]), list('B', ['A'], [0.7])], new Set(['a', 'b']));
    expect(both).toEqual([{ a: 'b', b: 'a', w: 0.7 }]);
  });
});

describe('reading the library', () => {
  it('weights heavy recent play above a follow, and a follow above one liked song', async () => {
    const { scoreLibrary } = await import('../src/map/library');
    const lib = scoreLibrary({
      top: [['Recent Favourite', 'Second'], ['Second', 'Old Favourite'], ['Old Favourite']],
      followed: ['Followed Only', 'Second'],
      liked: ['One Song', 'Liked A Lot', 'Liked A Lot', 'Liked A Lot', 'Liked A Lot'],
      playlists: [{ name: 'Road Trip', artists: ['Second', 'Playlist Only', 'Playlist Only'] }, { name: 'Focus', artists: ['Second'] }],
    });
    const w = (name: string) => lib.find((a) => a.name === name)!.weight;
    expect(lib[0].name).toBe('Second');
    expect(lib[0].weight).toBe(1);
    expect(w('Recent Favourite')).toBeGreaterThan(w('Followed Only'));
    expect(w('Followed Only')).toBeGreaterThan(w('Liked A Lot'));
    expect(w('Liked A Lot')).toBeGreaterThan(w('One Song'));
    expect(lib.find((a) => a.name === 'Second')!.playlists).toEqual(['Road Trip', 'Focus']);
    expect(lib.find((a) => a.name === 'Playlist Only')!.playlists).toEqual(['Road Trip']);
  });
  it('treats differently written names as one artist and copes with an empty library', async () => {
    const { scoreLibrary } = await import('../src/map/library');
    expect(scoreLibrary({ top: [['Beyoncé']], followed: ['beyonce'], liked: [], playlists: [] })).toHaveLength(1);
    expect(scoreLibrary({ top: [], followed: [], liked: [], playlists: [] })).toEqual([]);
  });
});

describe('genre data file', () => {
  it('is well formed: every link points at a real genre and every genre has a place', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const data = JSON.parse(readFileSync(join(__dirname, '../public/genres.json'), 'utf8'));
    expect(data.genres.length).toBeGreaterThan(1000);
    const names = new Set<string>();
    for (const g of data.genres) {
      expect(typeof g.n === 'string' && g.n.length > 0).toBe(true);
      expect(Number.isFinite(g.x) && Number.isFinite(g.y)).toBe(true);
      expect(g.s >= 0 && g.s <= 1).toBe(true);
      expect(g.f >= -1 && g.f < data.families.length).toBe(true);
      for (const link of [...g.p, ...g.i]) expect(Number.isInteger(link) && link >= 0 && link < data.genres.length).toBe(true);
      names.add(g.n.toLowerCase());
    }
    for (const must of ['jazz', 'rock', 'hip-hop', 'shoegaze', 'bebop', 'techno']) expect(names.has(must)).toBe(true);
  });
});

describe('leaving things off the map', () => {
  it('drops removed artists from the library, however they are written', async () => {
    const { scoreLibrary } = await import('../src/map/library');
    const input = { top: [['Raffi', 'Radiohead']], followed: ['Björk'], liked: [], playlists: [] };
    expect(scoreLibrary(input, new Set(['raffi', 'bjork'])).map((a) => a.name)).toEqual(['Radiohead']);
    expect(scoreLibrary(input).map((a) => a.name)).toEqual(['Raffi', 'Radiohead', 'Björk']);
  });
  it('adds and restores artists and playlists without duplicates', async () => {
    const { withArtist, withPlaylist } = await import('../src/map/exclude');
    let e = { playlists: [] as string[], artists: [] as { key: string; name: string }[] };
    e = withArtist(withArtist(e, 'Björk', true), 'bjork', true);
    expect(e.artists).toEqual([{ key: 'bjork', name: 'bjork' }]);
    e = withPlaylist(withPlaylist(e, 'Kids', true), 'Kids', true);
    expect(e.playlists).toEqual(['Kids']);
    expect(withArtist(e, 'BJÖRK', false).artists).toEqual([]);
    expect(withPlaylist(e, 'Kids', false).playlists).toEqual([]);
  });
});
