// Posters, flyers and tickets for an artist's gigs, from the Event Art Archive:
// the open picture library that goes with MusicBrainz's list of events. It is
// thinly filled, so most artists have nothing; when something is there it is shown.
import { mapLimit } from '../discover/mix';
import { cached, Provisional } from './cache';
import { isMbid, mb } from './musicbrainz';
import type { Picture } from './artwork';

const https = (u: string) => u.replace(/^http:\/\//, 'https://');
const WEEK = 7 * 86_400_000;
/** How many of an artist's events to check. Each is one small request, most of which find nothing. */
const MAX_EVENTS = 40;

export interface Gig {
  id: string;
  name: string;
  date?: string;
}

/** The pictures filed against one event, labelled with what they are and which gig they belong to. */
export function shapeEventArt(json: any, gig: Gig): Picture[] {
  return ((json?.images as any[]) || [])
    .filter((i) => i?.image && i.approved !== false)
    .map((i) => {
      const kind = ((i.types as string[]) || [])[0] || 'Poster';
      const when = gig.date ? gig.date.slice(0, 4) : '';
      return {
        thumb: https(i.thumbnails?.['500'] || i.thumbnails?.large || i.thumbnails?.['250'] || i.image),
        full: https(i.thumbnails?.['1200'] || i.image),
        label: [kind === 'Poster' ? '' : kind, gig.name, when].filter(Boolean).join(' · '),
        source: 'Event Art Archive',
        link: `https://musicbrainz.org/event/${gig.id}`,
      };
    });
}

export function gigsFrom(search: any): Gig[] {
  return ((search?.events as any[]) || [])
    .filter((e) => e?.id && e.name)
    .map((e) => ({ id: e.id as string, name: e.name as string, date: e['life-span']?.begin as string | undefined }))
    // Most recent first; undated events last.
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export function artistPosters(mbid: string): Promise<Picture[] | null> {
  if (!isMbid(mbid)) return Promise.resolve(null);
  return cached(
    `posters:${mbid}`,
    async () => {
      try {
        const gigs = gigsFrom(await mb<any>(`/event?query=arid:${mbid}&limit=100`)).slice(0, MAX_EVENTS);
        if (!gigs.length) return null;
        let failed = 0;
        const found = await mapLimit(gigs, 4, async (gig) => {
          try {
            const res = await fetch(`https://eventartarchive.org/event/${gig.id}`);
            if (res.status === 404) return [];
            if (!res.ok) throw new Error(String(res.status));
            return shapeEventArt(await res.json(), gig);
          } catch {
            failed++;
            return [];
          }
        });
        // If the archive couldn't be reached at all, don't remember that as "this artist has no posters".
        if (failed === gigs.length) throw new Error('unreachable');
        const pictures = found.flat().slice(0, 24);
        return pictures.length ? pictures : null;
      } catch {
        throw new Provisional(null);
      }
    },
    WEEK,
  );
}
