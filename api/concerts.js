// GET /api/concerts?artist=…&lat=…&lon=…&radius=…
// Upcoming shows by one artist near a place, from Ticketmaster's Discovery API.
// Needs TICKETMASTER_API_KEY (free). The location is rounded to about a
// kilometre before use, so cached answers are shared and exact coordinates
// are never stored.
import { geohash, shapeEvents } from './_lib/concerts.js';

export default async function handler(req, res) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return res.status(501).json({ error: 'Concerts are not set up: add TICKETMASTER_API_KEY.' });

  const artist = String(req.query.artist || '').slice(0, 200).trim();
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Math.min(Math.max(Math.round(Number(req.query.radius)) || 50, 5), 300);
  if (!artist || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'artist, lat and lon are required' });
  }

  const params = new URLSearchParams({
    apikey: key,
    keyword: artist,
    classificationName: 'music',
    geoPoint: geohash(lat, lon, 6),
    radius: String(radius),
    unit: 'miles',
    sort: 'date,asc',
    size: '30',
  });
  try {
    const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
    if (r.status === 401) return res.status(501).json({ error: 'Ticketmaster rejected the API key.' });
    if (r.status === 429) {
      res.setHeader('Retry-After', '1');
      return res.status(429).json({ error: 'Ticketmaster is rate limiting; try again shortly.' });
    }
    if (!r.ok) return res.status(502).json({ error: 'Ticketmaster is unavailable.' });
    // New shows are announced daily; half a day of caching keeps the scan cheap.
    res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    return res.status(200).json({ events: shapeEvents(await r.json(), artist) });
  } catch {
    return res.status(502).json({ error: 'Ticketmaster is unavailable.' });
  }
}
