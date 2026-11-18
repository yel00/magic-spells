// GET /api/news
// Music news and album reviews: headlines from a handful of publications' RSS
// feeds, with links to read them there. No key needed. Cached for half an hour
// so the publications are asked rarely however many people open the app.
import { FEEDS, mergeNews, parseFeed } from './_lib/news.js';

async function read(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MagicSpells feed reader)', Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  const lists = await Promise.all(FEEDS.map(read));
  const all = lists.flat();
  if (!all.length) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'The news feeds are unavailable.' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
  return res.status(200).json({
    news: mergeNews(all.filter((i) => i.kind === 'news'), { limit: 50, perSource: 5 }),
    reviews: mergeNews(all.filter((i) => i.kind === 'review'), { limit: 30, perSource: 5 }),
  });
}
