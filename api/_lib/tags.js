// Personal-tag sync, kept apart from the request handler so it can be tested
// against a real database. Same scheme as listening notes: every change gets
// the next number from a counter (`rev`), the newest edit wins, and a device
// asks only for what changed since the last number it saw.

export const SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS tags_rev;
CREATE TABLE IF NOT EXISTS tags (
  user_id     text    NOT NULL,
  subject_uri text    NOT NULL,
  tag         text    NOT NULL,
  title       text    NOT NULL DEFAULT '',
  subtitle    text    NOT NULL DEFAULT '',
  image       text,
  updated_at  bigint  NOT NULL,
  deleted     boolean NOT NULL DEFAULT false,
  rev         bigint  NOT NULL,
  PRIMARY KEY (user_id, subject_uri, tag)
);
CREATE INDEX IF NOT EXISTS tags_user_rev ON tags (user_id, rev);
`;

const URI = /^spotify:(track|album|artist|playlist):[A-Za-z0-9_]{1,64}$/;
export const LIMITS = { changes: 1000, tag: 40, text: 300, image: 600 };

/** Tags are compared in lower case with single spaces, so "Late Night" and "late  night" are one tag. */
export function normalizeTag(raw) {
  return String(raw ?? '').toLowerCase().replace(/[\u0000-\u001f#,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, LIMITS.tag);
}

const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Check one tagging from a device. Returns a safe copy, or null if it is malformed. */
export function cleanTagging(raw) {
  if (!raw || typeof raw !== 'object' || !URI.test(raw.subject_uri)) return null;
  const tag = normalizeTag(raw.tag);
  if (!tag) return null;
  const updated = Number.isFinite(raw.updated_at) && raw.updated_at > 0 && raw.updated_at < 4e12 ? Math.round(raw.updated_at) : null;
  if (!updated) return null;
  const image = typeof raw.image === 'string' && /^https:\/\//.test(raw.image) && raw.image.length <= LIMITS.image ? raw.image : null;
  return { subject_uri: raw.subject_uri, tag, title: text(raw.title, LIMITS.text), subtitle: text(raw.subtitle, LIMITS.text), image, updated_at: updated, deleted: !!raw.deleted };
}

function fromRow(r) {
  return { subject_uri: r.subject_uri, tag: r.tag, title: r.title, subtitle: r.subtitle, image: r.image, updated_at: Number(r.updated_at), deleted: r.deleted };
}

/** Apply a device's changes, then return everything that changed since `since`. `db` is anything with pg's query(text, params). */
export async function syncTags(db, userId, since, changes) {
  const now = Date.now();
  for (const raw of changes) {
    const t = cleanTagging(raw);
    if (!t) continue;
    await db.query(
      `INSERT INTO tags (user_id, subject_uri, tag, title, subtitle, image, updated_at, deleted, rev)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, nextval('tags_rev'))
       ON CONFLICT (user_id, subject_uri, tag) DO UPDATE SET
         title = EXCLUDED.title, subtitle = EXCLUDED.subtitle, image = EXCLUDED.image,
         updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, rev = nextval('tags_rev')
       WHERE tags.updated_at < EXCLUDED.updated_at`,
      [userId, t.subject_uri, t.tag, t.title, t.subtitle, t.image, Math.min(t.updated_at, now + 60_000), t.deleted],
    );
  }
  const from = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0;
  const { rows } = await db.query('SELECT * FROM tags WHERE user_id = $1 AND rev > $2 ORDER BY rev', [userId, from]);
  return { rev: rows.length ? Number(rows[rows.length - 1].rev) : from, tags: rows.map(fromRow) };
}
