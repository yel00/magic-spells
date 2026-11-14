import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module shared with the server function
import { cleanNote, SCHEMA, syncNotes } from '../api/_lib/notes.js';
import { markSent, mergeNotes, notesAbout, searchNotes } from '../src/notes/merge';
import type { LocalNote, Note } from '../src/notes/types';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const note = (n: number, over: Partial<LocalNote> = {}): LocalNote => ({
  id: id(n), subject_uri: 'spotify:album:abc', parent_uri: null, title: 'Album', subtitle: 'Artist', image: null,
  body: `note ${n}`, created_at: 1000 + n, updated_at: 1000 + n, deleted: false, ...over,
});

describe('notes on the device', () => {
  it('takes server copies but keeps newer unsent edits', () => {
    const local = [note(1), note(2, { body: 'mine', updated_at: 5000, dirty: true }), note(3, { body: 'old mine', updated_at: 2000, dirty: true })];
    const merged = mergeNotes(local, [note(1, { body: 'server 1', updated_at: 3000 }), note(2, { body: 'server 2', updated_at: 4000 }), note(3, { body: 'server 3', updated_at: 2500 }), note(4)]);
    const body = (n: number) => merged.find((x) => x.id === id(n))?.body;
    expect([body(1), body(2), body(3), body(4)]).toEqual(['server 1', 'mine', 'server 3', 'note 4']);
    expect(merged.find((x) => x.id === id(2))?.dirty).toBe(true);
  });
  it('keeps a note dirty if it was edited again during a sync', () => {
    const sent = [note(1, { updated_at: 10 }), note(2, { updated_at: 10 })];
    const now = [note(1, { updated_at: 10, dirty: true }), note(2, { updated_at: 20, dirty: true })];
    expect(markSent(now, sent).map((n) => !!n.dirty)).toEqual([false, true]);
  });
  it('shows track notes on their album and hides deleted ones', () => {
    const all = [note(1), note(2, { subject_uri: 'spotify:track:t1', parent_uri: 'spotify:album:abc' }), note(3, { deleted: true }), note(4, { subject_uri: 'spotify:album:other' })];
    expect(notesAbout(all, 'spotify:album:abc').map((n) => n.id)).toEqual([id(2), id(1)]);
    expect(searchNotes(all, 'NOTE 4').map((n) => n.id)).toEqual([id(4)]);
    expect(searchNotes(all, '').length).toBe(3);
  });
});

describe('note validation', () => {
  it('rejects malformed notes', () => {
    expect(cleanNote(note(1))).toMatchObject({ id: id(1), body: 'note 1' });
    expect(cleanNote({ ...note(1), id: 'nope' })).toBeNull();
    expect(cleanNote({ ...note(1), subject_uri: 'https://evil.example' })).toBeNull();
    expect(cleanNote({ ...note(1), body: 'x'.repeat(20001) })).toBeNull();
    expect(cleanNote({ ...note(1), updated_at: 'yesterday' })).toBeNull();
    expect(cleanNote(null)).toBeNull();
  });
  it('drops unsafe image links and blanks deleted bodies', () => {
    expect(cleanNote({ ...note(1), image: 'javascript:alert(1)' }).image).toBeNull();
    expect(cleanNote({ ...note(1), image: 'https://i.scdn.co/image/x' }).image).toBe('https://i.scdn.co/image/x');
    expect(cleanNote({ ...note(1), deleted: true }).body).toBe('');
  });
});

// Runs against a real Postgres when DATABASE_URL is set (CI provides one).
describe.skipIf(!process.env.DATABASE_URL)('notes sync against Postgres', () => {
  let db: pg.Pool;
  const strip = ({ dirty: _d, ...n }: LocalNote): Note => n;

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    await db.query('DROP TABLE IF EXISTS notes; DROP SEQUENCE IF EXISTS notes_rev;');
    await db.query(SCHEMA);
    await db.query(SCHEMA); // creating twice must be harmless: it runs on every cold start
  });
  afterAll(() => db.end());

  it('stores notes and hands them to a second device', async () => {
    const phone = await syncNotes(db, 'alice', 0, [strip(note(1)), strip(note(2))]);
    expect(phone.notes.map((n: Note) => n.body).sort()).toEqual(['note 1', 'note 2']);
    const ipad = await syncNotes(db, 'alice', 0, []);
    expect(ipad.notes).toHaveLength(2);
    expect(ipad.rev).toBe(phone.rev);
  });

  it('sends only what changed since the last sync', async () => {
    const before = await syncNotes(db, 'alice', 0, []);
    const none = await syncNotes(db, 'alice', before.rev, []);
    expect(none).toEqual({ rev: before.rev, notes: [] });
    await syncNotes(db, 'alice', before.rev, [strip(note(1, { body: 'edited', updated_at: 9000 }))]);
    const delta = await syncNotes(db, 'alice', before.rev, []);
    expect(delta.notes.map((n: Note) => n.body)).toEqual(['edited']);
    expect(delta.rev).toBeGreaterThan(before.rev);
  });

  it('keeps the newest edit when two devices disagree', async () => {
    await syncNotes(db, 'alice', 0, [strip(note(2, { body: 'newer', updated_at: 8000 }))]);
    const late = await syncNotes(db, 'alice', 0, [strip(note(2, { body: 'stale', updated_at: 7000 }))]);
    expect(late.notes.find((n: Note) => n.id === id(2)).body).toBe('newer');
  });

  it('carries deletions to other devices', async () => {
    await syncNotes(db, 'alice', 0, [strip(note(1, { deleted: true, updated_at: 9500 }))]);
    const other = await syncNotes(db, 'alice', 0, []);
    expect(other.notes.find((n: Note) => n.id === id(1))).toMatchObject({ deleted: true, body: '' });
  });

  it('never shows one person another person’s notes', async () => {
    await syncNotes(db, 'bob', 0, [strip(note(1, { body: 'bob only', updated_at: 99999 }))]);
    const alice = await syncNotes(db, 'alice', 0, []);
    expect(alice.notes.some((n: Note) => n.body === 'bob only')).toBe(false);
    const bob = await syncNotes(db, 'bob', 0, []);
    expect(bob.notes.map((n: Note) => n.body)).toEqual(['bob only']);
  });

  it('ignores malformed notes without failing the rest', async () => {
    const r = await syncNotes(db, 'carol', 0, [{ id: 'bad' }, strip(note(7))]);
    expect(r.notes.map((n: Note) => n.id)).toEqual([id(7)]);
  });

  it('caps a far-future edit time so the note can still be edited later', async () => {
    await syncNotes(db, 'dave', 0, [strip(note(1, { updated_at: Date.now() + 10 * 86_400_000 }))]);
    const r = await syncNotes(db, 'dave', 0, []);
    expect(r.notes[0].updated_at).toBeLessThan(Date.now() + 120_000);
  });
});
