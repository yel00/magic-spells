// POST /api/notes  { since, changes }            listening notes
// POST /api/notes?kind=tags  { since, changes }  personal tags
// Syncs a person's notes and tags between their devices. The caller proves who they
// are with their Spotify access token; we ask Spotify whose token it is and
// file the notes under that Spotify account. No separate login, no passwords.
import pg from 'pg';
import { bearer, spotifyUser } from './_lib/auth.js';
import { LIMITS, SCHEMA, syncNotes } from './_lib/notes.js';
import { LIMITS as TAG_LIMITS, SCHEMA as TAG_SCHEMA, syncTags } from './_lib/tags.js';

let pool;
let ready;

function database() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    pool = new pg.Pool({ connectionString: url, max: 2, ssl: local ? false : { rejectUnauthorized: true } });
    ready = pool.query(SCHEMA).then(() => pool.query(TAG_SCHEMA));
  }
  return pool;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const db = database();
  if (!db) return res.status(501).json({ error: 'Notes sync is not set up: add DATABASE_URL.' });

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in with Spotify first.' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  const tags = req.query?.kind === 'tags';
  if (changes.length > (tags ? TAG_LIMITS.changes : LIMITS.changes)) return res.status(413).json({ error: 'Too many changes in one sync.' });

  try {
    const userId = await spotifyUser(token);
    if (!userId) return res.status(401).json({ error: 'Spotify did not recognise this sign-in.' });
    await ready;
    const since = Number(body?.since) || 0;
    return res.status(200).json(tags ? await syncTags(db, userId, since, changes) : await syncNotes(db, userId, since, changes));
  } catch (e) {
    console.error('notes sync failed', e);
    return res.status(502).json({ error: 'Notes sync is unavailable right now.' });
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
