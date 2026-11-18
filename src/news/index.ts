// Music news and album reviews for the Home screen: headlines from music
// publications, opened on their own sites.
import { norm } from '../enrich/text';
import { isDemo } from '../spotify/auth';

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  kind: 'news' | 'review';
  /** When it was published, in milliseconds. */
  at: number;
  image: string;
  summary: string;
  /** One of your artists named in the headline, if any. */
  about?: string;
}

export interface NewsFeed {
  news: NewsItem[];
  reviews: NewsItem[];
}

const demo = (title: string, source: string, kind: NewsItem['kind'], hoursAgo: number, summary: string): NewsItem => ({
  title, source, kind, summary, image: '', link: 'https://example.com/', at: Date.now() - hoursAgo * 3_600_000,
});

const DEMO: NewsFeed = {
  news: [
    demo('The Slow Tide announce a spring tour and a new single', 'Demo Daily', 'news', 2, 'Twelve dates, starting in Portland.'),
    demo('Festival season: the first line-ups are out', 'Soundboard', 'news', 5, 'Who is playing where next summer.'),
    demo('A lost 1974 session surfaces after fifty years', 'The Needle', 'news', 26, 'Found in a mislabelled tape box.'),
  ],
  reviews: [
    demo('Paper Lanterns: Northern Line', 'Demo Daily', 'review', 8, 'A patient, glowing second album.'),
    demo('The Slow Tide: Soft Landing', 'Soundboard', 'review', 30, 'Their warmest record yet.'),
  ],
};

/** Null when the feeds can't be reached; the Home screen simply leaves the section out. */
export async function fetchNews(): Promise<NewsFeed | null> {
  if (isDemo()) return DEMO;
  try {
    const res = await fetch('/api/news');
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as NewsFeed;
  } catch {
    return null;
  }
}

/**
 * Marks headlines that name one of your artists and moves them to the front,
 * keeping the newest-first order within each group. Very short names are
 * ignored: "Air" or "X" would match half the headlines.
 */
export function yoursFirst(items: NewsItem[], artists: string[]): NewsItem[] {
  const names = artists.map((name) => ({ name, key: norm(name) })).filter((a) => a.key.length >= 4);
  const marked = items.map((item) => {
    const title = ` ${norm(item.title)} `;
    const hit = names.find((a) => title.includes(` ${a.key} `));
    return hit ? { ...item, about: hit.name } : item;
  });
  return [...marked.filter((i) => i.about), ...marked.filter((i) => !i.about)];
}

export function timeAgo(at: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000));
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
