// Critical reception for an album, from its Wikipedia article: the review
// scores table (which Wikipedia stores as structured data) and the opening
// paragraphs of the reception section. Licensed review text, as Roon carries,
// isn't available to an app like this; Wikipedia's summary of the reviews is.
import { cached, Provisional } from './cache';

export interface Rating {
  source: string;
  /** As the publication gave it: "4/5", "8.5/10", "B+". */
  score: string;
  /** 0–1 when the score is numeric, for drawing a bar. */
  fraction?: number;
}

export interface RatingTable {
  title: string;
  /** Aggregators such as Metacritic. */
  aggregate: Rating[];
  ratings: Rating[];
}

export interface Reception {
  paragraphs: string[];
  tables: RatingTable[];
  url: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—' };

export function decodeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/** Wikitext for a name or score -> plain text. */
function cleanWiki(wt: string): string {
  return wt
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readScore(wt: string): { score: string; fraction?: number } | null {
  const stars = /\{\{\s*rating\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i.exec(wt);
  if (stars) return { score: `${stars[1]}/${stars[2]}`, fraction: clamp(Number(stars[1]) / Number(stars[2])) };
  const christgau = /\{\{\s*rating-christgau\s*\|\s*([^}|]+)/i.exec(wt);
  const text = christgau ? christgau[1].trim() : cleanWiki(wt);
  if (!text) return null;
  const num = /^([\d.]+)\s*\/\s*([\d.]+)/.exec(text);
  if (num && Number(num[2]) > 0) return { score: `${num[1]}/${num[2]}`, fraction: clamp(Number(num[1]) / Number(num[2])) };
  const pct = /^([\d.]+)\s*%/.exec(text);
  if (pct) return { score: `${pct[1]}%`, fraction: clamp(Number(pct[1]) / 100) };
  return { score: text.replace(/-/g, '−').slice(0, 24) };
}

const clamp = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined);

const AGGREGATORS: Record<string, string> = { mc: 'Metacritic', adm: 'AnyDecentMusic?', aoty: 'Album of the Year' };

/** Every "review scores" table in an article's HTML. */
export function ratingTables(html: string): RatingTable[] {
  const tables: RatingTable[] = [];
  for (const m of html.matchAll(/data-mw='([^']*)'/g)) {
    if (!/"wt":"(Album|Music) (ratings|reviews)/i.test(m[1])) continue;
    let parts: any[];
    try {
      parts = JSON.parse(decodeHtml(m[1])).parts || [];
    } catch {
      continue;
    }
    for (const part of parts) {
      const params: Record<string, { wt?: string }> | undefined = part?.template?.params;
      if (!params || !/^(Album|Music) (ratings|reviews)/i.test(part.template.target?.wt || '')) continue;
      const get = (key: string) => Object.entries(params).find(([k]) => k.trim().toLowerCase() === key)?.[1]?.wt || '';
      const table: RatingTable = { title: cleanWiki(get('title')) || 'Review scores', aggregate: [], ratings: [] };
      for (const [key, label] of Object.entries(AGGREGATORS)) {
        const s = readScore(get(key));
        if (s) table.aggregate.push({ source: label, ...s });
      }
      for (let i = 1; i <= 20; i++) {
        const source = cleanWiki(get(`rev${i}`));
        const s = readScore(get(`rev${i}score`));
        if (source && s) table.ratings.push({ source, ...s });
      }
      if (table.aggregate.length || table.ratings.length) tables.push(table);
    }
  }
  return tables;
}

const RECEPTION = /^(critical\s+|commercial and critical\s+)?(reception|response|reviews)|^release and reception|^reception and legacy|^critical/i;

/** The opening paragraphs of the article's reception section, and the heading's anchor. */
export function receptionText(html: string): { paragraphs: string[]; anchor: string } | null {
  const headings = [...html.matchAll(/<h([23])\b[^>]*\bid=(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/h\1>/g)];
  const at = headings.findIndex((h) => RECEPTION.test(decodeHtml(h[4].replace(/<[^>]+>/g, '')).trim()));
  if (at < 0) return null;
  const start = headings[at].index! + headings[at][0].length;
  const level = Number(headings[at][1]);
  const stop = (from: number) => headings.slice(from).find((h) => Number(h[1]) <= level)?.index ?? html.length;
  const paragraphsIn = (region: string) =>
    [...region.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
      .map((p) =>
        decodeHtml(
          p[1]
            .replace(/<style[\s\S]*?<\/style>/g, '')
            .replace(/<sup\b[\s\S]*?<\/sup>/g, '')
            .replace(/<[^>]+>/g, ''),
        )
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((t) => t.length >= 60);
  // Prefer the text directly under the heading; if it only has sub-headings, read on into them.
  const firstSub = headings[at + 1]?.index ?? html.length;
  let paragraphs = paragraphsIn(html.slice(start, Math.min(firstSub, stop(at + 1))));
  if (!paragraphs.length) paragraphs = paragraphsIn(html.slice(start, stop(at + 1)));
  if (!paragraphs.length) return null;
  return { paragraphs: paragraphs.slice(0, 3), anchor: decodeHtml(headings[at][2] ?? headings[at][3] ?? '') };
}

export function titleFromUrl(url: string): string | null {
  const m = /\/wiki\/([^?#]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Reception for the album whose Wikipedia article is at `articleUrl`. */
export function receptionFor(articleUrl: string): Promise<Reception | null> {
  const title = titleFromUrl(articleUrl);
  if (!title) return Promise.resolve(null);
  return cached(`reception:${title}`, async () => {
    try {
      let res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}?redirect=true`);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title)}?redirect=true`);
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
      const html = await res.text();
      const text = receptionText(html);
      const tables = ratingTables(html);
      if (!text && !tables.length) return null;
      const base = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
      return { paragraphs: text?.paragraphs || [], tables, url: text?.anchor ? `${base}#${encodeURIComponent(text.anchor)}` : base };
    } catch {
      throw new Provisional(null);
    }
  });
}

export function demoReception(name: string): Reception {
  return {
    paragraphs: [`“${name}” is an invented album, so these reviews are invented too. With a real library this is Wikipedia's account of how the album was received: what critics praised, what they didn't, and how opinion has shifted since.`],
    tables: [{
      title: 'Review scores',
      aggregate: [{ source: 'Metacritic', score: '81/100', fraction: 0.81 }],
      ratings: [{ source: 'The Demo Times', score: '4/5', fraction: 0.8 }, { source: 'Lantern Review', score: '8.5/10', fraction: 0.85 }, { source: 'Harbor Weekly', score: 'B+' }, { source: 'Signal', score: '3.5/4', fraction: 0.875 }],
    }],
    url: 'https://en.wikipedia.org/wiki/Main_Page',
  };
}
