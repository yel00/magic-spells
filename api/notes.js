// POST /api/notes  { since, changes }
// Syncs listening notes between a person's devices. The caller proves who they
// are with their Spotify access token; we ask Spotify whose token it is and
// file the notes under that Spotify account. No separate login, no passwords.
import pg from 'pg';
import { LIMITS, SCHEMA, syncNotes } from './_lib/notes.js';

let pool;
let ready;
const known = new Map(); // token -> { id, until }

function database() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    pool = new pg.Pool({ connectionString: url, max: 2, ssl: local ? false : { rejectUnauthorized: true } });
    ready = pool.query(SCHEMA);
  }
  return pool;
}

async function spotifyUser(token) {
  const hit = known.get(token);
  if (hit && hit.until > Date.now()) return hit.id;
  const r = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Spotify ${r.status}`);
  const { id } = await r.json();
  if (!id) return null;
  if (known.size > 500) known.clear();
  known.set(token, { id, until: Date.now() + 5 * 60_000 });
  return id;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const db = database();
  if (!db) return res.status(501).json({ error: 'Notes sync is not set up: add DATABASE_URL.' });

  const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) return res.status(401).json({ error: 'Sign in with Spotify first.' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length > LIMITS.changes) return res.status(413).json({ error: 'Too many changes in one sync.' });

  try {
    const userId = await spotifyUser(token);
    if (!userId) return res.status(401).json({ error: 'Spotify did not recognise this sign-in.' });
    await ready;
    return res.status(200).json(await syncNotes(db, userId, Number(body?.since) || 0, changes));
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
