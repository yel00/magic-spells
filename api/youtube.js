// GET /api/youtube?q=…
// Finds videos (live performances, other versions) on YouTube. Needs
// YOUTUBE_API_KEY. A search costs 100 of the 10,000 free daily units, so
// results are cached at the edge for a week and on the device for a month.
import { shapeYoutube } from './_lib/discover.js';

export default async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(501).json({ error: 'YouTube is not set up: add YOUTUBE_API_KEY.' });
  const q = String(req.query.q || '').slice(0, 200).trim();
  if (!q) return res.status(400).json({ error: 'q is required' });
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(q)}&key=${key}`;
    const r = await fetch(url);
    const json = await r.json().catch(() => null);
    if (r.status === 400 || r.status === 401) return res.status(501).json({ error: 'YouTube rejected the API key.' });
    if (r.status === 403) return res.status(429).json({ error: 'Today’s YouTube search allowance is used up.' });
    if (!r.ok || !json) return res.status(502).json({ error: 'YouTube is unavailable.' });
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).json({ videos: shapeYoutube(json) });
  } catch {
    return res.status(502).json({ error: 'YouTube is unavailable.' });
  }
}
