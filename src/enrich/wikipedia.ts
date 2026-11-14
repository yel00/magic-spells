import type { Summary } from './types';
import { norm } from './text';

async function json<T>(url: string): Promise<T | null> {
  let res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429) {
    // Briefly rate limited: one polite retry.
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(url, { headers: { Accept: 'application/json' } });
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return (await res.json()) as T;
}

interface RestSummary {
  type?: string;
  extract?: string;
  description?: string;
  thumbnail?: { source: string };
  content_urls?: { desktop?: { page?: string }; mobile?: { page?: string } };
}

async function summary(title: string): Promise<(Summary & { description: string }) | null> {
  const s = await json<RestSummary>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`);
  if (!s?.extract || s.type === 'disambiguation') return null;
  return {
    text: s.extract,
    url: s.content_urls?.mobile?.page || s.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    source: 'Wikipedia',
    image: s.thumbnail?.source,
    description: s.description || '',
  };
}

/** The exact article a Wikidata item points at: no guessing involved. */
export async function summaryForWikidata(id: string): Promise<Summary | null> {
  const data = await json<any>(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=sitelinks&sitefilter=enwiki&format=json&origin=*`);
  const title: string | undefined = data?.entities?.[id]?.sitelinks?.enwiki?.title;
  if (!title) return null;
  const s = await summary(title);
  if (!s) return null;
  const { description: _d, ...rest } = s;
  return rest;
}

const MUSIC = /\b(band|singer|musician|rapper|composer|dj|duo|trio|quartet|group|songwriter|producer|orchestra|ensemble|pianist|guitarist|drummer|bassist|violinist|saxophonist|trumpeter|vocalist|collective|choir|artist)\b/i;

/**
 * Fallback when there is no Wikidata link: search by name, and only accept an
 * article that describes itself as music. Showing nothing beats showing the
 * biography of an unrelated person with the same name.
 */
export async function searchSummary(kind: 'artist' | 'album', name: string, artist?: string): Promise<Summary | null> {
  const query = kind === 'artist' ? `${name} (band OR musician OR singer)` : `"${name}" ${artist} album`;
  const data = await json<any>(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`);
  for (const hit of data?.query?.search || []) {
    const s = await summary(hit.title);
    if (!s) continue;
    const titleOk = norm(hit.title.replace(/\s*\(.*\)$/, '')) === norm(name);
    const ok =
      kind === 'artist'
        ? titleOk && MUSIC.test(s.description + ' ' + s.text.slice(0, 200))
        : titleOk && /\b(album|ep|soundtrack|mixtape|record)\b/i.test(s.description) && norm(s.text).includes(norm(artist || ''));
    if (ok) {
      const { description: _d, ...rest } = s;
      return rest;
    }
  }
  return null;
}
