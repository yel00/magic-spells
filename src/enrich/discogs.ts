// "Everything this person worked on", from Discogs, which records credits by
// role (producer, engineer, appears on…) more completely than any other open
// source. No key: the free tier allows 25 requests a minute.
import { cached, Provisional } from './cache';
import { norm } from './text';

export interface Work {
  title: string;
  artist: string;
  year?: number;
}

export interface WorkGroup {
  role: string;
  works: Work[];
}

export interface Credits {
  groups: WorkGroup[];
  /** How many releases Discogs lists in total; only the most recent few hundred are fetched. */
  total: number;
}

const ROLE_LABEL: Record<string, string> = {
  Main: 'Own releases',
  Appearance: 'Appears on',
  TrackAppearance: 'Appears on',
  Producer: 'Produced',
  'Co-producer': 'Produced',
  Remix: 'Remixed',
};
const ROLE_ORDER = ['Own releases', 'Produced', 'Appears on', 'Remixed'];

/** Discogs numbers artists who share a name ("Nirvana (2)") and marks some names with a trailing asterisk. */
export const cleanArtist = (s: string) => String(s || '').replace(/\s*\(\d+\)/g, '').replace(/\*+$/g, '').trim();

/** Group a person's Discogs releases by what they did, newest first, one entry per album. */
export function groupWorks(releases: any[]): WorkGroup[] {
  const groups = new Map<string, Map<string, Work>>();
  for (const r of releases || []) {
    if (!r?.title || !r.role || r.role === 'UnofficialRelease') continue;
    const role = ROLE_LABEL[r.role] || r.role.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    const work: Work = { title: r.title, artist: cleanArtist(r.artist), year: r.year || undefined };
    const g = groups.get(role) || groups.set(role, new Map()).get(role)!;
    const key = `${norm(work.artist)}|${norm(work.title)}`;
    const have = g.get(key);
    // Reissues repeat the same album; keep its earliest year.
    if (!have || (work.year && (!have.year || work.year < have.year))) g.set(key, work);
  }
  return [...groups.entries()]
    .map(([role, works]) => ({ role, works: [...works.values()].sort((a, b) => (b.year || 0) - (a.year || 0)) }))
    .sort((a, b) => {
      const ia = ROLE_ORDER.indexOf(a.role);
      const ib = ROLE_ORDER.indexOf(b.role);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || b.works.length - a.works.length;
    });
}

export function creditsFor(discogsId: string): Promise<Credits | null> {
  return cached(`discogs:${discogsId}`, async () => {
    try {
      const all: any[] = [];
      let total = 0;
      // Three pages (300 releases) covers most careers without leaning on the rate limit.
      for (let page = 1; page <= 3; page++) {
        const res = await fetch(`https://api.discogs.com/artists/${discogsId}/releases?sort=year&sort_order=desc&per_page=100&page=${page}`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Discogs ${res.status}`);
        const data = await res.json();
        total = data.pagination?.items ?? total;
        all.push(...(data.releases || []));
        if (page >= (data.pagination?.pages ?? 1)) break;
      }
      const groups = groupWorks(all);
      return groups.length ? { groups, total } : null;
    } catch {
      throw new Provisional(null);
    }
  });
}
