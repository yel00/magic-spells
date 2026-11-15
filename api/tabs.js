// GET /api/tabs?title=…&artist=…
// Finds this song's tab on Songsterr and says which instruments it covers, so
// the app can link straight to it. Only search results are fetched; the tab
// itself stays on Songsterr, which holds the licence to show it.
import { shapeTabs } from './_lib/tabs.js';

export default async function handler(req, res) {
  const title = String(req.query.title || '').slice(0, 200).trim();
  const artist = String(req.query.artist || '').slice(0, 200).trim();
  if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' });
  try {
    const r = await fetch(`https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(`${artist} ${title}`)}&size=20`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; magic-spells personal music app)', Accept: 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'Tab search is unavailable.' });
    res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).json({ tabs: shapeTabs(await r.json(), title, artist) });
  } catch {
    return res.status(502).json({ error: 'Tab search is unavailable.' });
  }
}
