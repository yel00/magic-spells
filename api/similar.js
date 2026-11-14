// GET /api/similar?artist=…
// Similar artists from Last.fm, whose "people who play X also play Y" data is
// the best freely available. Needs LASTFM_API_KEY; without it the app falls
// back to ListenBrainz, which needs no key.
import { shapeLastfmSimilar } from './_lib/discover.js';

export default async function handler(req, res) {
  const key = process.env.LASTFM_API_KEY;
  if (!key) return res.status(501).json({ error: 'Last.fm is not set up: add LASTFM_API_KEY.' });
  const artist = String(req.query.artist || '').slice(0, 200).trim();
  if (!artist) return res.status(400).json({ error: 'artist is required' });
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist)}&autocorrect=1&limit=30&format=json&api_key=${key}`;
    const r = await fetch(url);
    const json = await r.json().catch(() => null);
    if (json?.error === 10 || json?.error === 26) return res.status(501).json({ error: 'Last.fm rejected the API key.' });
    if (json?.error === 6) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400');
      return res.status(404).json({ error: 'Artist not found' });
    }
    if (!r.ok || !json) return res.status(502).json({ error: 'Last.fm is unavailable.' });
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).json({ source: 'Last.fm', artists: shapeLastfmSimilar(json) });
  } catch {
    return res.status(502).json({ error: 'Last.fm is unavailable.' });
  }
}
