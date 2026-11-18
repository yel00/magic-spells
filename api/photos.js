// Your pictures from concerts, kept so they appear on all your devices.
//   POST /api/photos            { deleted: [ids] }   list every picture; remove the ones named
//   PUT  /api/photos?id=…&added=…   (image bytes)    store one picture
//   GET  /api/photos?id=…                            fetch one picture
// The files live in Vercel Blob (BLOB_READ_WRITE_TOKEN); which pictures belong
// to whom is recorded in the database. A picture is only ever handed to the
// Spotify account that added it.
import { createHash } from 'node:crypto';
import { del, get, put } from '@vercel/blob';
import { bearer, spotifyUser } from './_lib/auth.js';
import { database } from './_lib/db.js';
import { countPhotos, LIMITS, listPhotos, photoRow, readPhotoId, recordPhoto, removePhotos } from './_lib/shows.js';

async function bodyBytes(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > LIMITS.photoBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const looksLikeImage = (b) => b.length > 12 && ((b[0] === 0xff && b[1] === 0xd8) || b.subarray(1, 4).toString() === 'PNG' || b.subarray(8, 12).toString() === 'WEBP');

/** Stores a file privately where the store allows it; older stores only take public files with unguessable addresses. */
async function store(pathname, bytes, token) {
  const options = { token, addRandomSuffix: true, contentType: 'image/jpeg' };
  try {
    return { access: 'private', ...(await put(pathname, bytes, { ...options, access: 'private' })) };
  } catch {
    return { access: 'public', ...(await put(pathname, bytes, { ...options, access: 'public' })) };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim();
  const dbs = database();
  if (!token || !dbs) return res.status(501).json({ error: 'Picture sync is not set up: connect a Blob store and a database.' });
  const who = bearer(req);
  if (!who) return res.status(401).json({ error: 'Sign in with Spotify first.' });

  try {
    const userId = await spotifyUser(who);
    if (!userId) return res.status(401).json({ error: 'Spotify did not recognise this sign-in.' });
    const { db, ready } = dbs;
    await ready;

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const gone = await removePhotos(db, userId, Array.isArray(body.deleted) ? body.deleted : []);
      if (gone.length) await del(gone, { token }).catch((e) => console.error('picture files not deleted', e));
      return res.status(200).json({ photos: await listPhotos(db, userId) });
    }

    const photo = readPhotoId(req.query?.id);
    if (!photo) return res.status(400).json({ error: 'A picture id is required.' });

    if (req.method === 'PUT') {
      if (await photoRow(db, userId, photo.id)) return res.status(200).json({ ok: true });
      if ((await countPhotos(db, userId)) >= LIMITS.photosPerUser) return res.status(413).json({ error: 'Picture limit reached.' });
      const bytes = await bodyBytes(req);
      if (!bytes || bytes.length > LIMITS.photoBytes) return res.status(413).json({ error: 'That picture is too large.' });
      if (!looksLikeImage(bytes)) return res.status(400).json({ error: 'That is not a picture.' });
      const folder = createHash('sha256').update(userId).digest('hex').slice(0, 24);
      const saved = await store(`shows/${folder}/${photo.id.replace(/:/g, '-')}.jpg`, bytes, token);
      await recordPhoto(db, userId, photo, saved.pathname, saved.access, Number(req.query?.added));
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const row = await photoRow(db, userId, photo.id);
      if (!row || row.deleted) return res.status(404).json({ error: 'No such picture.' });
      const file = await get(row.pathname, { access: row.access, token });
      if (!file || !file.stream) return res.status(404).json({ error: 'No such picture.' });
      const bytes = Buffer.from(await new Response(file.stream).arrayBuffer());
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      return res.status(200).send(bytes);
    }
    return res.status(405).json({ error: 'GET, PUT or POST only' });
  } catch (e) {
    console.error('picture sync failed', e);
    return res.status(502).json({ error: 'Picture sync is unavailable right now.' });
  }
}
