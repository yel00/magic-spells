// Reads music publications' RSS feeds into one list of headlines. Only the
// headline, a short summary, the picture and the link are kept: the article
// itself is read on the publication's own site. Free of network code so it
// can be tested.

export const FEEDS = [
  { source: 'Pitchfork', kind: 'news', url: 'https://pitchfork.com/feed/feed-news/rss' },
  { source: 'Stereogum', kind: 'news', url: 'https://www.stereogum.com/feed/' },
  { source: 'NME', kind: 'news', url: 'https://www.nme.com/news/music/feed' },
  { source: 'Consequence', kind: 'news', url: 'https://consequence.net/category/music/feed/' },
  { source: 'Rolling Stone', kind: 'news', url: 'https://www.rollingstone.com/music/music-news/feed/' },
  { source: 'The Quietus', kind: 'news', url: 'https://thequietus.com/feed' },
  { source: 'NPR Music', kind: 'news', url: 'https://www.npr.org/rss/rss.php?id=1039' },
  { source: 'DJ Mag', kind: 'news', url: 'https://djmag.com/feed' },
  { source: 'Bandcamp Daily', kind: 'news', url: 'https://daily.bandcamp.com/feed/' },
  { source: 'Pitchfork', kind: 'review', url: 'https://pitchfork.com/feed/feed-album-reviews/rss' },
  { source: 'NME', kind: 'review', url: 'https://www.nme.com/reviews/album/feed' },
  { source: 'Rolling Stone', kind: 'review', url: 'https://www.rollingstone.com/music/music-album-reviews/feed/' },
  { source: 'Stereogum', kind: 'review', url: 'https://www.stereogum.com/category/reviews/feed/' },
  { source: 'Clash', kind: 'review', url: 'https://www.clashmusic.com/reviews/feed/' },
  { source: 'Loud and Quiet', kind: 'review', url: 'https://www.loudandquiet.com/reviews/feed/' },
];

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

export function decode(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

const cdata = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
const tag = (xml, name) => cdata(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1] || '').trim();
const attr = (xml, name, attribute) => new RegExp(`<${name}\\s[^>]*?\\b${attribute}=["']([^"']+)["']`, 'i').exec(xml)?.[1] || '';

/** Plain text from a feed's description: no markup, no "appeared first on" footer, cut at a word. */
export function plain(html, max = 180) {
  const text = decode(decode(cdata(html)).replace(/<p>\s*The post[\s\S]*?appeared first on[\s\S]*?<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/ ([.,;:!?])/g, '$1').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

const httpsOnly = (u) => (/^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');

function pictureIn(item) {
  const candidates = [
    attr(item, 'media:thumbnail', 'url'),
    attr(item, 'media:content', 'url'),
    /<enclosure\s[^>]*type=["']image/i.test(item) ? attr(item, 'enclosure', 'url') : '',
    attr(decode(cdata(tag(item, 'description'))), 'img', 'src'),
    attr(decode(cdata(tag(item, 'content:encoded'))), 'img', 'src'),
  ];
  return httpsOnly(decode(candidates.find(Boolean) || ''));
}

/** The headlines in one feed. Anything without a title, a link or a date is skipped. */
export function parseFeed(xml, { source, kind }) {
  const items = String(xml || '').match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items
    .map((item) => {
      const title = plain(tag(item, 'title'), 200);
      const link = httpsOnly(decode(tag(item, 'link')));
      const at = Date.parse(tag(item, 'pubDate') || tag(item, 'dc:date'));
      if (!title || !link || !Number.isFinite(at)) return null;
      return { title, link, source, kind, at, image: pictureIn(item), summary: plain(tag(item, 'description')) };
    })
    .filter(Boolean);
}

/**
 * One list from many feeds, newest first. No publication may fill more than
 * `perSource` places, so a site that posts every ten minutes doesn't crowd out the rest.
 */
const TOO_OLD = 60 * 86_400_000;

export function mergeNews(items, { limit = 30, perSource = 6, now = Date.now() } = {}) {
  const seen = new Set();
  const count = new Map();
  const out = [];
  for (const item of [...items].sort((a, b) => b.at - a.at)) {
    // Feeds sometimes carry a date in the future; don't let one sit at the top.
    // ...and some feeds never drop their old entries.
    if (item.at > now + 3_600_000 || item.at < now - TOO_OLD || seen.has(item.link)) continue;
    const n = count.get(item.source) || 0;
    if (n >= perSource) continue;
    seen.add(item.link);
    count.set(item.source, n + 1);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
