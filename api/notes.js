// POST /api/notes  { since, changes }                    listening notes
// POST /api/notes?kind=tags  { since, changes }          personal tags
// POST /api/notes?kind=shows { since, changes, place }   concerts you were at, and your concert area
// Syncs a person's notes, tags and concerts between their devices. The caller
// proves who they are with their Spotify access token; we ask Spotify whose
// token it is and file everything under that Spotify account. No separate
// login, no passwords.
import { bearer, spotifyUser } from './_lib/auth.js';
import { database } from './_lib/db.js';
import { LIMITS, syncNotes } from './_lib/notes.js';
import { LIMITS as SHOW_LIMITS, syncPlace, syncShows } from './_lib/shows.js';
import { LIMITS as TAG_LIMITS, syncTags } from './_lib/tags.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const store = database();
  if (!store) return res.status(501).json({ error: 'Notes sync is not set up: add DATABASE_URL.' });

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in with Spotify first.' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  const kind = req.query?.kind;
  const tags = kind === 'tags';
  if (changes.length > (tags ? TAG_LIMITS.changes : kind === 'shows' ? SHOW_LIMITS.changes : LIMITS.changes)) return res.status(413).json({ error: 'Too many changes in one sync.' });

  try {
    const userId = await spotifyUser(token);
    if (!userId) return res.status(401).json({ error: 'Spotify did not recognise this sign-in.' });
    const { db, ready } = store;
    await ready;
    const since = Number(body?.since) || 0;
    if (kind === 'shows') return res.status(200).json({ ...(await syncShows(db, userId, since, changes)), place: await syncPlace(db, userId, body?.place) });
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
