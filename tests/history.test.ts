import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanEntry, mergeHistory, searchKey, syncHistory, type HistoryEntry } from '../api/_lib/history.js';
// @ts-expect-error plain JS server module
import { SCHEMA } from '../api/_lib/shows.js';
import { whenLabel } from '../src/views/Search';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const search = (title: string, at: number, gone = false): HistoryEntry => ({ key: searchKey(title), kind: 'search', title, at, ...(gone && { gone }) });
const item = (id: string, at: number, gone = false): HistoryEntry => ({ key: `spotify:album:${id}`, kind: 'item', uri: `spotify:album:${id}`, title: `Album ${id}`, sub: 'Artist', image: 'https://i.scdn.co/image/x', at, ...(gone && { gone }) });

describe('search history: entries', () => {
  it('treats the same words in different capitals or spacing as one search', () => {
    expect(searchKey('  Slow   Tide ')).toBe(searchKey('slow tide'));
    expect(cleanEntry({ kind: 'search', title: '  Slow   Tide ', at: 5 })).toEqual({ key: 'q:slow tide', kind: 'search', title: 'Slow Tide', at: 5 });
  });

  it('accepts things on Spotify and refuses anything else', () => {
    expect(cleanEntry(item('abc', 5))).toMatchObject({ key: 'spotify:album:abc', title: 'Album abc', image: 'https://i.scdn.co/image/x' });
    expect(cleanEntry({ ...item('abc', 5), image: 'javascript:alert(1)' })).toMatchObject({ image: null });
    expect(cleanEntry({ ...item('abc', 5), uri: 'https://evil.example' })).toBeNull();
    expect(cleanEntry({ kind: 'search', title: '   ', at: 5 })).toBeNull();
    expect(cleanEntry({ kind: 'search', title: 'x', at: 'now' })).toBeNull();
    expect(cleanEntry({ kind: 'other', title: 'x', at: 5 })).toBeNull();
    expect(cleanEntry(null)).toBeNull();
  });
});

describe('search history: merging two devices', () => {
  it('keeps what each device added, newest first', () => {
    const merged = mergeHistory([search('wire', NOW - 100), item('a', NOW - 300)], [search('can', NOW - 200), item('b', NOW - 50)], NOW);
    expect(merged.map((e) => e.key)).toEqual(['spotify:album:b', 'q:wire', 'q:can', 'spotify:album:a']);
  });

  it('lets the newest change to an entry win, including forgetting it', () => {
    const forgotten = mergeHistory([search('wire', NOW - 100)], [search('wire', NOW - 50, true)], NOW);
    expect(forgotten).toEqual([{ key: 'q:wire', kind: 'search', title: 'wire', at: NOW - 50, gone: true }]);
    // Searching for it again later brings it back.
    expect(mergeHistory(forgotten, [search('Wire', NOW - 10)], NOW)[0]).toEqual({ key: 'q:wire', kind: 'search', title: 'Wire', at: NOW - 10 });
  });

  it('keeps the newest thirty of each kind and drops stale forgotten markers', () => {
    const many = Array.from({ length: 45 }, (_, i) => search(`query ${i}`, NOW - i * 1000));
    const merged = mergeHistory(many, [item('a', NOW), search('old', NOW - 40 * 86_400_000, true), search('recent', NOW - 86_400_000, true)], NOW);
    expect(merged.filter((e) => e.kind === 'search' && !e.gone)).toHaveLength(30);
    expect(merged.some((e) => e.title === 'query 29')).toBe(true);
    expect(merged.some((e) => e.title === 'query 30')).toBe(false);
    expect(merged.filter((e) => e.gone).map((e) => e.title)).toEqual(['recent']);
    expect(merged.filter((e) => e.kind === 'item')).toHaveLength(1);
  });

  it('ignores rubbish and copes with nothing', () => {
    expect(mergeHistory(null, undefined, NOW)).toEqual([]);
    expect(mergeHistory([{ junk: true }, search('ok', NOW)], 'nope', NOW)).toHaveLength(1);
  });

  it('labels when something was opened', () => {
    const noon = new Date(2026, 10, 19, 12).getTime();
    expect(whenLabel(noon - 3_600_000, noon)).toBe('Today');
    expect(whenLabel(new Date(2026, 10, 18, 23).getTime(), noon)).toBe('Yesterday');
    expect(whenLabel(new Date(2026, 10, 16, 9).getTime(), noon)).toMatch(/Mon/);
    expect(whenLabel(new Date(2026, 9, 2, 9).getTime(), noon)).toMatch(/2/);
  });
});

describe.skipIf(!process.env.DATABASE_URL)('search history sync against Postgres', () => {
  let db: pg.Pool;
  beforeAll(async () => {
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await db.query(SCHEMA);
    await db.query("DELETE FROM prefs WHERE key = 'history'");
  });
  afterAll(() => db.end());

  it('gives a second device what the first one searched, and spreads a forget both ways', async () => {
    const now = Date.now();
    const phone = await syncHistory(db, 'hana', [search('wire', now - 500), item('a', now - 400)]);
    expect(phone.entries).toHaveLength(2);
    const desktop = await syncHistory(db, 'hana', [search('can', now - 300)]);
    expect(desktop.entries.map((e) => e.key).sort()).toEqual(['q:can', 'q:wire', 'spotify:album:a']);
    await syncHistory(db, 'hana', [search('wire', now - 100, true)]);
    const phoneAgain = await syncHistory(db, 'hana', [search('wire', now - 500), item('a', now - 400)]);
    expect(phoneAgain.entries.find((e) => e.key === 'q:wire')?.gone).toBe(true);
    expect((await syncHistory(db, 'ivo', [])).entries).toEqual([]);
    expect((await syncHistory(db, 'hana', 'rubbish')).entries).toHaveLength(3);
  });
});
