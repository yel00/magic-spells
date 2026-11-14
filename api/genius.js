// GET /api/genius?title=…&artist=…
// Looks a song up on Genius and returns its background. Runs on the server so
// the Genius access token (GENIUS_ACCESS_TOKEN) never reaches the browser.
// Genius does not license lyrics through its API, so this returns the song's
// story, credits and a link to the lyrics page — not the lyrics themselves.
import { pickHit, shapeSong } from './_lib/genius.js';

const API = 'https://api.genius.com';

export default async function handler(req, res) {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) return res.status(501).json({ error: 'Genius is not set up: add GENIUS_ACCESS_TOKEN.' });

  const title = String(req.query.title || '').slice(0, 200).trim();
  const artist = String(req.query.artist || '').slice(0, 200).trim();
  if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' });

  const call = async (path) => {
    const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw Object.assign(new Error(`Genius ${r.status}`), { status: r.status });
    return (await r.json()).response;
  };

  try {
    const search = await call(`/search?q=${encodeURIComponent(`${title} ${artist}`)}`);
    const hit = pickHit(search.hits, title, artist);
    if (!hit) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400');
      return res.status(404).json({ error: 'No matching song' });
    }
    const { song } = await call(`/songs/${hit.id}?text_format=plain`);
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).json(shapeSong(song));
  } catch (e) {
    const status = e.status === 401 || e.status === 403 ? 501 : 502;
    return res.status(status).json({ error: status === 501 ? 'Genius rejected the access token.' : 'Genius is unavailable.' });
  }
}
