// Listening-notes sync, kept apart from the request handler so it can be
// tested against a real database.
//
// Each note carries the time it was last edited on a device. The newest edit
// wins. Every accepted change gets the next number from a counter (`rev`), and
// a device asks for "everything after the last number I saw", so a sync only
// ever moves what changed.

export const SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS notes_rev;
CREATE TABLE IF NOT EXISTS notes (
  user_id     text    NOT NULL,
  id          uuid    NOT NULL,
  subject_uri text    NOT NULL,
  parent_uri  text,
  title       text    NOT NULL DEFAULT '',
  subtitle    text    NOT NULL DEFAULT '',
  image       text,
  body        text    NOT NULL DEFAULT '',
  created_at  bigint  NOT NULL,
  updated_at  bigint  NOT NULL,
  deleted     boolean NOT NULL DEFAULT false,
  rev         bigint  NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS notes_user_rev ON notes (user_id, rev);
`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Notes are about something on Spotify, or about a past concert (a setlist.fm show).
const URI = /^(spotify:(track|album|artist|playlist):[A-Za-z0-9_]{1,64}|setlistfm:show:[0-9a-f]{6,16})$/;
export const LIMITS = { changes: 500, body: 20000, text: 300, image: 600 };

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const time = (v) => (Number.isFinite(v) && v > 0 && v < 4e12 ? Math.round(v) : null);

/** Check one note from a device. Returns a safe copy, or null if it is malformed. */
export function cleanNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!UUID.test(raw.id) || !URI.test(raw.subject_uri)) return null;
  const created = time(raw.created_at);
  const updated = time(raw.updated_at);
  if (!created || !updated) return null;
  if (typeof raw.body !== 'string' || raw.body.length > LIMITS.body) return null;
  const image = typeof raw.image === 'string' && /^https:\/\//.test(raw.image) && raw.image.length <= LIMITS.image ? raw.image : null;
  return {
    id: raw.id.toLowerCase(),
    subject_uri: raw.subject_uri,
    parent_uri: URI.test(raw.parent_uri) ? raw.parent_uri : null,
    title: text(raw.title, LIMITS.text),
    subtitle: text(raw.subtitle, LIMITS.text),
    image,
    body: raw.deleted ? '' : raw.body,
    created_at: created,
    updated_at: updated,
    deleted: !!raw.deleted,
  };
}

function fromRow(r) {
  return {
    id: r.id,
    subject_uri: r.subject_uri,
    parent_uri: r.parent_uri,
    title: r.title,
    subtitle: r.subtitle,
    image: r.image,
    body: r.body,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    deleted: r.deleted,
  };
}

/**
 * Apply a device's changes, then return everything that changed since `since`.
 * `db` is anything with pg's `query(text, params)`.
 */
export async function syncNotes(db, userId, since, changes) {
  const now = Date.now();
  for (const raw of changes) {
    const n = cleanNote(raw);
    if (!n) continue;
    // A device with a fast clock must not be able to lock a note against later edits.
    const updated = Math.min(n.updated_at, now + 60_000);
    await db.query(
      `INSERT INTO notes (user_id, id, subject_uri, parent_uri, title, subtitle, image, body, created_at, updated_at, deleted, rev)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, nextval('notes_rev'))
       ON CONFLICT (user_id, id) DO UPDATE SET
         subject_uri = EXCLUDED.subject_uri, parent_uri = EXCLUDED.parent_uri, title = EXCLUDED.title,
         subtitle = EXCLUDED.subtitle, image = EXCLUDED.image, body = EXCLUDED.body,
         updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, rev = nextval('notes_rev')
       WHERE notes.updated_at < EXCLUDED.updated_at`,
      [userId, n.id, n.subject_uri, n.parent_uri, n.title, n.subtitle, n.image, n.body, n.created_at, updated, n.deleted],
    );
  }
  const from = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0;
  const { rows } = await db.query('SELECT * FROM notes WHERE user_id = $1 AND rev > $2 ORDER BY rev', [userId, from]);
  const rev = rows.length ? Number(rows[rows.length - 1].rev) : from;
  return { rev, notes: rows.map(fromRow) };
}
