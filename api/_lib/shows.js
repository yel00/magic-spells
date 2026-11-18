// Sync for the concerts a listener has been to, the area they watch for
// upcoming shows, and the list of pictures they have added to shows. Same
// scheme as notes and tags: every change takes the next number from a counter
// (`rev`), the newest edit wins, and a device asks for what changed since the
// last number it saw. Kept apart from the request handlers so it can be tested
// against a real database.

export const SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS shows_rev;
CREATE TABLE IF NOT EXISTS my_shows (
  user_id     text    NOT NULL,
  id          text    NOT NULL,
  data        jsonb   NOT NULL,
  updated_at  bigint  NOT NULL,
  deleted     boolean NOT NULL DEFAULT false,
  rev         bigint  NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS my_shows_user_rev ON my_shows (user_id, rev);
CREATE TABLE IF NOT EXISTS prefs (
  user_id     text    NOT NULL,
  key         text    NOT NULL,
  value       jsonb,
  updated_at  bigint  NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS show_photos (
  user_id     text    NOT NULL,
  id          text    NOT NULL,
  show_id     text    NOT NULL,
  pathname    text    NOT NULL,
  access      text    NOT NULL,
  added       bigint  NOT NULL,
  deleted     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, id)
);
`;

export const LIMITS = { changes: 500, text: 300, photoBytes: 4_000_000, photosPerUser: 2000 };

const SHOW_ID = /^[0-9a-f]{6,16}$/;
const PHOTO_ID = /^([0-9a-f]{6,16}):\d{10,14}:[a-z0-9]{1,8}$/;
const text = (v) => (typeof v === 'string' ? v.slice(0, LIMITS.text) : '');
const stamp = (v) => (Number.isFinite(v) && v > 0 && v < 4e12 ? Math.round(v) : null);

/** Check one show from a device. Returns a safe copy, or null if it is malformed. */
export function cleanShow(raw) {
  if (!raw || typeof raw !== 'object' || !SHOW_ID.test(raw.id)) return null;
  const updated = stamp(raw.updated_at);
  if (!updated) return null;
  const url = typeof raw.url === 'string' && /^https:\/\/www\.setlist\.fm\//.test(raw.url) ? raw.url.slice(0, 400) : '';
  return {
    id: raw.id,
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : '',
    artist: { name: text(raw.artist?.name), mbid: text(raw.artist?.mbid).slice(0, 36) },
    venue: text(raw.venue),
    city: text(raw.city),
    region: text(raw.region),
    country: text(raw.country),
    tour: text(raw.tour),
    info: text(raw.info),
    url,
    songCount: Number.isInteger(raw.songCount) && raw.songCount >= 0 && raw.songCount < 1000 ? raw.songCount : 0,
    updated_at: updated,
    deleted: !!raw.deleted,
  };
}

/** The area someone watches for concerts, or null to clear it. `undefined` means malformed. */
export function cleanPlace(raw) {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const { lat, lon, radius } = raw;
  if (![lat, lon, radius].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || radius <= 0 || radius > 1000) return undefined;
  const name = text(raw.name).slice(0, 120);
  return name ? { name, lat, lon, radius } : undefined;
}

/** Apply a device's changes, then return everything that changed since `since`. `db` is anything with pg's query(text, params). */
export async function syncShows(db, userId, since, changes) {
  const now = Date.now();
  for (const raw of changes) {
    const s = cleanShow(raw);
    if (!s) continue;
    const { id, updated_at, deleted, ...data } = s;
    await db.query(
      `INSERT INTO my_shows (user_id, id, data, updated_at, deleted, rev)
       VALUES ($1,$2,$3,$4,$5, nextval('shows_rev'))
       ON CONFLICT (user_id, id) DO UPDATE SET
         data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, deleted = EXCLUDED.deleted, rev = nextval('shows_rev')
       WHERE my_shows.updated_at < EXCLUDED.updated_at`,
      [userId, id, JSON.stringify(data), Math.min(updated_at, now + 60_000), deleted],
    );
  }
  const from = Number.isFinite(since) && since > 0 ? Math.floor(since) : 0;
  const { rows } = await db.query('SELECT * FROM my_shows WHERE user_id = $1 AND rev > $2 ORDER BY rev', [userId, from]);
  return {
    rev: rows.length ? Number(rows[rows.length - 1].rev) : from,
    shows: rows.map((r) => ({ ...r.data, id: r.id, updated_at: Number(r.updated_at), deleted: r.deleted })),
  };
}

/**
 * Keep whichever choice of area is newer: the device's or the one already stored.
 * `mine` is { value, updated_at } or nothing. Returns what is stored afterwards, or null if nothing ever was.
 */
export async function syncPlace(db, userId, mine) {
  const updated = mine ? stamp(mine.updated_at) : null;
  const value = mine ? cleanPlace(mine.value) : undefined;
  if (updated && value !== undefined) {
    await db.query(
      `INSERT INTO prefs (user_id, key, value, updated_at) VALUES ($1,'place',$2,$3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
       WHERE prefs.updated_at < EXCLUDED.updated_at`,
      [userId, JSON.stringify(value), Math.min(updated, Date.now() + 60_000)],
    );
  }
  const { rows } = await db.query("SELECT value, updated_at FROM prefs WHERE user_id = $1 AND key = 'place'", [userId]);
  return rows.length ? { value: rows[0].value, updated_at: Number(rows[0].updated_at) } : null;
}

/** Splits a picture's id into the show it belongs to. Null if the id is malformed. */
export function readPhotoId(id) {
  const m = PHOTO_ID.exec(String(id || ''));
  return m ? { id: m[0], showId: m[1] } : null;
}

/** Every picture someone has, including removed ones so other devices drop them too. */
export async function listPhotos(db, userId) {
  const { rows } = await db.query('SELECT id, show_id, added, deleted FROM show_photos WHERE user_id = $1 ORDER BY added', [userId]);
  return rows.map((r) => ({ id: r.id, show_id: r.show_id, added: Number(r.added), deleted: r.deleted }));
}

export async function photoRow(db, userId, id) {
  const { rows } = await db.query('SELECT * FROM show_photos WHERE user_id = $1 AND id = $2', [userId, id]);
  return rows[0] || null;
}

export async function countPhotos(db, userId) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM show_photos WHERE user_id = $1 AND NOT deleted', [userId]);
  return rows[0].n;
}

export async function recordPhoto(db, userId, { id, showId }, pathname, access, added) {
  await db.query(
    `INSERT INTO show_photos (user_id, id, show_id, pathname, access, added) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, id) DO NOTHING`,
    [userId, id, showId, pathname, access, stamp(added) || Date.now()],
  );
}

/** Marks pictures as removed and returns where their files are, so the files can be deleted. */
export async function removePhotos(db, userId, ids) {
  const wanted = ids.map((i) => readPhotoId(i)?.id).filter(Boolean).slice(0, 200);
  if (!wanted.length) return [];
  const { rows } = await db.query(
    'UPDATE show_photos SET deleted = true WHERE user_id = $1 AND id = ANY($2) AND NOT deleted RETURNING pathname',
    [userId, wanted],
  );
  return rows.map((r) => r.pathname);
}
