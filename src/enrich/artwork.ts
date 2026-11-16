// Pictures beyond the cover Spotify shows: an album's back cover, booklet and
// disc label from the Cover Art Archive (the picture library that goes with
// MusicBrainz), and the photographs used in an artist's Wikipedia article.
// Both are free and need no key.
import { cached, Provisional } from './cache';

export interface Picture {
  /** A size suited to a thumbnail strip. */
  thumb: string;
  /** A size suited to filling the screen. */
  full: string;
  /** What it is: "Back cover", "Booklet", or a photograph's caption. */
  label: string;
  /** Where it came from, for credit. */
  source: string;
  /** A page about the picture (its file page, or the release it belongs to). */
  link?: string;
}

const https = (u: string) => u.replace(/^http:\/\//, 'https://').replace(/^\/\//, 'https://');

const TYPE_LABEL: Record<string, string> = {
  Front: 'Front cover', Back: 'Back cover', Booklet: 'Booklet', Medium: 'Disc', Tray: 'Tray', Spine: 'Spine', Obi: 'Obi strip',
  Poster: 'Poster', Sticker: 'Sticker', Liner: 'Liner notes', Track: 'Track art', 'Raw/Unedited': 'Scan', Watermark: 'Scan', Other: 'Other',
};
const TYPE_ORDER = ['Front', 'Back', 'Booklet', 'Liner', 'Poster', 'Medium', 'Tray', 'Obi', 'Sticker', 'Spine', 'Track', 'Other'];

/** Cover Art Archive images for one release, ordered front, back, booklet, then the rest. */
export function shapeArtwork(json: any, releaseId: string): Picture[] {
  const rank = (types: string[]) => Math.min(...(types.length ? types : ['Other']).map((t) => (TYPE_ORDER.indexOf(t) < 0 ? 99 : TYPE_ORDER.indexOf(t))));
  return ((json?.images as any[]) || [])
    .filter((i) => i?.image && i.approved !== false)
    .map((i, n) => ({ i, n, types: (i.types as string[]) || [] }))
    .sort((a, b) => rank(a.types) - rank(b.types) || a.n - b.n)
    .map(({ i, types }) => {
      const kind = types.find((t) => t !== 'Front' || types.length === 1) || 'Other';
      return {
        thumb: https(i.thumbnails?.['500'] || i.thumbnails?.large || i.thumbnails?.['250'] || i.image),
        full: https(i.thumbnails?.['1200'] || i.image),
        label: [TYPE_LABEL[kind] || kind, i.comment].filter(Boolean).join(' · '),
        source: 'Cover Art Archive',
        link: `https://musicbrainz.org/release/${releaseId}/cover-art`,
      };
    });
}

/** The release id inside a MusicBrainz release link, which album info already carries. */
export function releaseIdFrom(links: { label: string; url: string }[] | undefined): string | null {
  const url = links?.find((l) => l.label === 'MusicBrainz')?.url;
  return /\/release\/([0-9a-f-]{36})/.exec(url || '')?.[1] ?? null;
}

export function albumArtwork(releaseId: string): Promise<Picture[] | null> {
  return cached(`art:${releaseId}`, async () => {
    try {
      const res = await fetch(`https://coverartarchive.org/release/${releaseId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cover Art Archive ${res.status}`);
      const pictures = shapeArtwork(await res.json(), releaseId);
      return pictures.length ? pictures : null;
    } catch {
      throw new Provisional(null);
    }
  });
}

/** Photographs from a Wikipedia article's image list, leaving out icons, logos and sound-file markers. */
export function shapePhotos(json: any): Picture[] {
  const out: Picture[] = [];
  for (const item of (json?.items as any[]) || []) {
    if (item?.type !== 'image' || item.showInGallery === false || !item.srcset?.length) continue;
    const title: string = item.title || '';
    if (!/\.(jpe?g|png|webp|tiff?)$/i.test(title)) continue; // .svg files are logos and icons
    const sizes: { src: string; scale: string }[] = item.srcset;
    const small = sizes[0].src;
    // Anything Wikipedia itself renders under 200 pixels wide is an icon, not a photograph.
    const width = Number(/\/(\d+)px-/.exec(small)?.[1]) || 0;
    if (width && width < 200) continue;
    const caption = String(item.caption?.text || '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
    out.push({
      thumb: https(small),
      full: https(sizes[sizes.length - 1].src),
      label: caption || title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/_/g, ' '),
      source: 'Wikimedia Commons',
      link: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    });
  }
  return out.slice(0, 16);
}

export function artistPhotos(articleUrl: string): Promise<Picture[] | null> {
  const title = /\/wiki\/([^?#]+)/.exec(articleUrl)?.[1];
  if (!title) return Promise.resolve(null);
  return cached(`photos:${decodeURIComponent(title)}`, async () => {
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${title}`;
      let res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await fetch(url);
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
      const pictures = shapePhotos(await res.json());
      return pictures.length ? pictures : null;
    } catch {
      throw new Provisional(null);
    }
  });
}

/** Stand-in pictures for the demo library. */
export function demoPictures(kind: 'album' | 'artist' | 'poster', name: string): Picture[] {
  const labels = kind === 'album' ? ['Back cover', 'Booklet', 'Booklet', 'Disc'] : kind === 'poster' ? ['Harbor Hall · 2019', 'Flyer · Summer Stage · 2021'] : ['On stage, Demo City', 'In the studio'];
  const colours = [['#3b2a6b', '#c9b6ff'], ['#0f4c5c', '#9ad1d4'], ['#6b2a3b', '#ffb4a2'], ['#4b3b1a', '#ffd98a']];
  return labels.map((label, i) => {
    const [a, b] = colours[(name.length + i) % colours.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${kind === 'album' ? '600 600' : kind === 'poster' ? '600 850' : '800 600'}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#15151a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="52%" font-family="Georgia,serif" font-size="44" fill="${b}" text-anchor="middle">${label}</text></svg>`;
    const url = 'data:image/svg+xml,' + encodeURIComponent(svg);
    return { thumb: url, full: url, label, source: kind === 'poster' ? 'Demo poster' : 'Demo image' };
  });
}
