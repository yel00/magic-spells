// GET /api/setlists?mbid=…[&year=2012][&p=2]   an artist's past shows, newest first
// GET /api/setlists?id=…                       one show with its setlist
// From setlist.fm, which needs SETLISTFM_API_KEY (free for non-commercial use).
import { readQuery, shapeList, shapeShow } from './_lib/setlists.js';

const BASE = 'https://api.setlist.fm/rest/1.0';

export default async function handler(req, res) {
  const key = String(process.env.SETLISTFM_API_KEY || '').trim();
  if (!key) return res.status(501).json({ error: 'Past shows are not set up: add SETLISTFM_API_KEY.' });
  const q = readQuery(req.query || {});
  if (!q) return res.status(400).json({ error: 'mbid or id is required' });
  const url = q.kind === 'show'
    ? `${BASE}/setlist/${q.id}`
    : `${BASE}/search/setlists?artistMbid=${q.mbid}&p=${q.page}${q.year ? `&year=${q.year}` : ''}`;
  try {
    const r = await fetch(url, { headers: { 'x-api-key': key, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) return res.status(501).json({ error: 'setlist.fm rejected the API key.' });
    if (r.status === 429) return res.status(429).json({ error: 'setlist.fm is busy. Try again in a moment.' });
    if (r.status === 404) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400');
      return q.kind === 'show' ? res.status(404).json({ error: 'No such show.' }) : res.status(200).json({ shows: [], page: q.page, perPage: 20, total: 0 });
    }
    const json = r.ok ? await r.json().catch(() => null) : null;
    if (!json) return res.status(502).json({ error: 'setlist.fm is unavailable.' });
    // setlist.fm asks that its data is only kept briefly, and recent shows are still being filled in.
    res.setHeader('Cache-Control', 'public, s-maxage=86400');
    if (q.kind === 'list') return res.status(200).json(shapeList(json));
    const show = shapeShow(json);
    return show ? res.status(200).json({ show }) : res.status(404).json({ error: 'No such show.' });
  } catch {
    return res.status(502).json({ error: 'setlist.fm is unavailable.' });
  }
}
