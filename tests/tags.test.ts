import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the server function
import { cleanTagging, normalizeTag as serverNormalize, SCHEMA, syncTags } from '../api/_lib/tags.js';
import { markTagsSent, mergeTags, normalizeTag, tagCounts, taggedWith, tagsOn, type LocalTagging, type Tagging } from '../src/tags/logic';

const tagging = (uri: string, tag: string, over: Partial<LocalTagging> = {}): LocalTagging => ({ subject_uri: `spotify:${uri}`, tag, title: uri, subtitle: '', image: null, updated_at: 1000, deleted: false, ...over });

describe('tags on the device', () => {
  it('treats differently typed tags as one, on the device and the server alike', () => {
    for (const [raw, want] of [['  Late  Night ', 'late night'], ['#Chill', 'chill'], ['a,b', 'a b'], ['', ''], ['x'.repeat(60), 'x'.repeat(40)]]) {
      expect(normalizeTag(raw)).toBe(want);
      expect(serverNormalize(raw)).toBe(want);
    }
  });
  const all = [
    tagging('album:a', 'late night', { updated_at: 3000 }), tagging('album:a', 'vinyl'), tagging('track:t', 'late night', { updated_at: 5000 }),
    tagging('artist:x', 'late night', { deleted: true }), tagging('artist:x', 'vinyl', { updated_at: 2000 }),
  ];
  it('lists the tags on one thing, and all tags by use', () => {
    expect(tagsOn(all, 'spotify:album:a')).toEqual(['late night', 'vinyl']);
    expect(tagsOn(all, 'spotify:artist:x')).toEqual(['vinyl']);
    expect(tagCounts(all)).toEqual([{ tag: 'late night', count: 2 }, { tag: 'vinyl', count: 2 }]);
  });
  it('finds what carries every chosen tag, newest first', () => {
    expect(taggedWith(all, ['late night']).map((s) => s.subject_uri)).toEqual(['spotify:track:t', 'spotify:album:a']);
    expect(taggedWith(all, ['late night', 'vinyl']).map((s) => s.subject_uri)).toEqual(['spotify:album:a']);
    expect(taggedWith(all, [])).toEqual([]);
  });
  it('keeps a newer unsent change over the server’s copy', () => {
    const local = [tagging('album:a', 'x', { deleted: true, updated_at: 9000, dirty: true }), tagging('album:a', 'y', { dirty: true, updated_at: 100 })];
    const merged = mergeTags(local, [tagging('album:a', 'x', { updated_at: 5000 }), tagging('album:a', 'y', { deleted: true, updated_at: 200 }), tagging('album:b', 'z')]);
    expect(merged.map((t) => [t.subject_uri.slice(-1), t.tag, t.deleted])).toEqual([['a', 'x', true], ['a', 'y', true], ['b', 'z', false]]);
    expect(markTagsSent([tagging('album:a', 'x', { dirty: true, updated_at: 10 }), tagging('album:a', 'y', { dirty: true, updated_at: 20 })], [tagging('album:a', 'x', { updated_at: 10 }), tagging('album:a', 'y', { updated_at: 10 })]).map((t) => !!t.dirty)).toEqual([false, true]);
  });
});

describe('tag validation', () => {
  it('rejects malformed taggings and stores tags normalised', () => {
    expect(cleanTagging(tagging('album:a', '  Late Night '))).toMatchObject({ tag: 'late night', subject_uri: 'spotify:album:a' });
    expect(cleanTagging({ ...tagging('album:a', 'x'), subject_uri: 'https://evil.example' })).toBeNull();
    expect(cleanTagging(tagging('album:a', '   '))).toBeNull();
    expect(cleanTagging({ ...tagging('album:a', 'x'), updated_at: 'now' })).toBeNull();
    expect(cleanTagging({ ...tagging('album:a', 'x'), image: 'javascript:alert(1)' }).image).toBeNull();
  });
});

describe.skipIf(!process.env.DATABASE_URL)('tag sync against Postgres', () => {
  let db: pg.Pool;
  const strip = ({ dirty: _d, ...t }: LocalTagging): Tagging => t;
  beforeAll(async () => {
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await db.query('DROP TABLE IF EXISTS tags; DROP SEQUENCE IF EXISTS tags_rev;');
    await db.query(SCHEMA);
    await db.query(SCHEMA);
  });
  afterAll(() => db.end());

  it('stores tags, hands them to a second device, and sends only what changed', async () => {
    const phone = await syncTags(db, 'alice', 0, [strip(tagging('album:a', 'Vinyl')), strip(tagging('track:t', 'late night'))]);
    expect(phone.tags.map((t: Tagging) => t.tag).sort()).toEqual(['late night', 'vinyl']);
    expect((await syncTags(db, 'alice', 0, [])).tags).toHaveLength(2);
    expect(await syncTags(db, 'alice', phone.rev, [])).toEqual({ rev: phone.rev, tags: [] });
  });
  it('treats re-adding the same tag in different capitals as the same tag', async () => {
    await syncTags(db, 'alice', 0, [strip(tagging('album:a', 'VINYL', { updated_at: 2000 }))]);
    expect((await syncTags(db, 'alice', 0, [])).tags.filter((t: Tagging) => t.subject_uri === 'spotify:album:a')).toHaveLength(1);
  });
  it('carries a removal to other devices, and lets the tag be added back later', async () => {
    await syncTags(db, 'alice', 0, [strip(tagging('album:a', 'vinyl', { deleted: true, updated_at: 3000 }))]);
    expect((await syncTags(db, 'alice', 0, [])).tags.find((t: Tagging) => t.tag === 'vinyl')?.deleted).toBe(true);
    await syncTags(db, 'alice', 0, [strip(tagging('album:a', 'vinyl', { updated_at: 4000 }))]);
    expect((await syncTags(db, 'alice', 0, [])).tags.find((t: Tagging) => t.tag === 'vinyl')?.deleted).toBe(false);
  });
  it('keeps the newest change and never mixes two people’s tags', async () => {
    const late = await syncTags(db, 'alice', 0, [strip(tagging('album:a', 'vinyl', { deleted: true, updated_at: 3500 }))]);
    expect(late.tags.find((t: Tagging) => t.tag === 'vinyl').deleted).toBe(false);
    await syncTags(db, 'bob', 0, [strip(tagging('album:a', 'bob only'))]);
    expect((await syncTags(db, 'alice', 0, [])).tags.some((t: Tagging) => t.tag === 'bob only')).toBe(false);
    expect((await syncTags(db, 'bob', 0, [])).tags.map((t: Tagging) => t.tag)).toEqual(['bob only']);
  });
});
