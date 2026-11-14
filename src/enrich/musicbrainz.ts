// MusicBrainz: the open music encyclopedia. Free, no key, but limited to one
// request a second, so calls are queued and everything is cached hard.
import type { CreditGroup, Link, Person } from './types';
import { cleanTitle, norm, sameName } from './text';

const BASE = 'https://musicbrainz.org/ws/2';
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function mb<T>(path: string): Promise<T> {
  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const wait = lastCall + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      const res = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}fmt=json`, { headers: { Accept: 'application/json' } });
      if (res.status === 503 && attempt < 2) continue; // rate limited: go round again after the gap
      if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
      return (await res.json()) as T;
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

const q = (s: string) => encodeURIComponent(`"${s.replace(/["\\]/g, ' ')}"`);

// ---- Artists ----------------------------------------------------------------

export interface MbArtist {
  facts: string[];
  genres: string[];
  links: Link[];
  wikidata?: string;
}

const HOSTS: [RegExp, string][] = [
  [/instagram\.com/, 'Instagram'], [/facebook\.com/, 'Facebook'], [/(twitter|x)\.com/, 'X'], [/tiktok\.com/, 'TikTok'],
  [/youtube\.com/, 'YouTube'], [/bandcamp\.com/, 'Bandcamp'], [/soundcloud\.com/, 'SoundCloud'], [/discogs\.com/, 'Discogs'],
  [/allmusic\.com/, 'AllMusic'], [/last\.fm/, 'Last.fm'], [/setlist\.fm/, 'Setlist.fm'], [/songkick\.com/, 'Songkick'],
  [/bandsintown\.com/, 'Bandsintown'], [/genius\.com/, 'Genius'], [/rateyourmusic\.com/, 'Rate Your Music'],
];
const LINK_ORDER = ['Official site', 'Bandcamp', 'YouTube', 'Instagram', 'Genius', 'Discogs', 'AllMusic', 'Last.fm', 'Setlist.fm', 'Songkick', 'Bandsintown', 'SoundCloud', 'Rate Your Music', 'Facebook', 'X', 'TikTok'];

export function linksFrom(relations: any[] | undefined): { links: Link[]; wikidata?: string } {
  const found = new Map<string, string>();
  let wikidata: string | undefined;
  for (const r of relations || []) {
    const url: string | undefined = r?.url?.resource;
    if (!url || r.ended) continue;
    if (r.type === 'wikidata') {
      wikidata = url.split('/').pop();
      continue;
    }
    const label = r.type === 'official homepage' ? 'Official site' : HOSTS.find(([re]) => re.test(url))?.[1];
    if (label && !found.has(label)) found.set(label, url);
  }
  const links = LINK_ORDER.filter((l) => found.has(l)).map((label) => ({ label, url: found.get(label)! }));
  return { links, wikidata };
}

export function artistFacts(a: any): string[] {
  const facts: string[] = [];
  const person = a.type === 'Person';
  const begin: string | undefined = a['life-span']?.begin;
  const end: string | undefined = a['life-span']?.end;
  if (begin) facts.push(`${person ? 'Born' : 'Formed'} ${begin.slice(0, 4)}`);
  if (end) facts.push(`${person ? 'Died' : 'Disbanded'} ${end.slice(0, 4)}`);
  const place = [a['begin-area']?.name, a.area?.name].filter((v, i, all) => v && all.indexOf(v) === i).join(', ');
  if (place) facts.push(place);
  if (a.type && a.type !== 'Person') facts.push(a.type);
  return facts;
}

export async function findArtist(name: string): Promise<MbArtist | null> {
  const search = await mb<{ artists?: any[] }>(`/artist?query=artist:${q(name)}&limit=5`);
  const hits = search.artists || [];
  // Only trust an exact name match; a near miss would put the wrong biography on the page.
  const hit = hits.find((a) => a.score >= 90 && (sameName(a.name, name) || (a.aliases || []).some((x: any) => sameName(x.name, name))));
  if (!hit) return null;
  const a = await mb<any>(`/artist/${hit.id}?inc=url-rels+genres`);
  const { links, wikidata } = linksFrom(a.relations);
  const genres = (a.genres || []).sort((x: any, y: any) => y.count - x.count).slice(0, 5).map((g: any) => g.name);
  return { facts: artistFacts(a), genres, links, wikidata };
}

// ---- Albums -----------------------------------------------------------------

export interface MbAlbum {
  facts: string[];
  credits: CreditGroup[];
  links: Link[];
  wikidata?: string;
}

const PERFORM = new Set(['instrument', 'vocal', 'performer', 'performing orchestra', 'conductor', 'chorus master', 'concertmaster']);
const WRITE = new Set(['composer', 'lyricist', 'writer', 'librettist']);
const PRODUCE = new Set(['producer']);
const ENGINEER: Record<string, string> = {
  engineer: 'engineer', recording: 'recording', mix: 'mixing', mastering: 'mastering', sound: 'sound', programming: 'programming',
  arranger: 'arranger', orchestrator: 'orchestration', 'instrument arranger': 'arranger', 'vocal arranger': 'vocal arranger',
};
const ARTWORK: Record<string, string> = { 'graphic design': 'design', design: 'design', 'design/illustration': 'design', illustration: 'illustration', photography: 'photography', 'art direction': 'art direction' };

/** Fold the per-track relationship data MusicBrainz returns into album-level credit groups. */
export function creditsFrom(release: any): CreditGroup[] {
  const groups = new Map<string, Map<string, { details: Map<string, number>; count: number }>>();
  const add = (group: string, name: string, detail?: string) => {
    if (!name) return;
    const g = groups.get(group) || groups.set(group, new Map()).get(group)!;
    const p = g.get(name) || g.set(name, { details: new Map(), count: 0 }).get(name)!;
    p.count++;
    if (detail) p.details.set(detail, (p.details.get(detail) || 0) + 1);
  };
  const take = (rel: any) => {
    if (rel['target-type'] !== 'artist' || !rel.artist) return;
    const name: string = rel['target-credit'] || rel.artist.name;
    const attrs: string[] = (rel.attributes || []).filter((a: string) => !['additional', 'guest', 'solo', 'co', 'executive', 'assistant', 'associate'].includes(a));
    const prefix = (rel.attributes || []).find((a: string) => ['executive', 'co', 'assistant', 'additional'].includes(a));
    if (PERFORM.has(rel.type)) {
      const detail = attrs.length ? attrs : [rel.type === 'vocal' ? 'vocals' : rel.type === 'instrument' ? '' : rel.type];
      detail.forEach((d) => add('Performers', name, d || undefined));
    } else if (WRITE.has(rel.type)) add('Written by', name);
    else if (PRODUCE.has(rel.type)) add('Produced by', name, prefix && prefix !== 'additional' ? `${prefix === 'co' ? 'co-' : prefix + ' '}producer` : undefined);
    else if (ENGINEER[rel.type]) add('Engineering & arrangement', name, ENGINEER[rel.type]);
    else if (ARTWORK[rel.type]) add('Artwork', name, ARTWORK[rel.type]);
  };

  (release.relations || []).forEach(take);
  for (const medium of release.media || []) {
    for (const track of medium.tracks || []) {
      for (const rel of track.recording?.relations || []) {
        if (rel['target-type'] === 'work') (rel.work?.relations || []).forEach(take);
        else take(rel);
      }
    }
  }

  const order = ['Performers', 'Written by', 'Produced by', 'Engineering & arrangement', 'Artwork'];
  return order
    .filter((title) => groups.has(title))
    .map((title) => ({
      title,
      people: [...groups.get(title)!.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .slice(0, 40)
        .map(([name, p]): Person => {
          const details = [...p.details.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
          return { name, detail: details.slice(0, 5).join(', ').replace(/ \(drum set\)/g, '') || undefined };
        }),
    }));
}

export function albumFacts(release: any): string[] {
  const facts: string[] = [];
  const labels = (release['label-info'] || []).map((l: any) => l.label?.name).filter(Boolean);
  const unique = [...new Set<string>(labels)];
  if (unique.length) facts.push(unique.slice(0, 2).join(' / '));
  const cat = (release['label-info'] || []).map((l: any) => l['catalog-number']).find(Boolean);
  if (cat) facts.push(`Cat. ${cat}`);
  const first = release['release-group']?.['first-release-date'];
  if (first) facts.push(`First released ${first.slice(0, 4)}`);
  return facts;
}

function creditCount(r: any): number {
  return creditsFrom(r).reduce((n, g) => n + g.people.length, 0);
}

export async function findAlbum(album: { name: string; artist: string; upc?: string }): Promise<MbAlbum | null> {
  const inc = 'inc=recordings+artist-credits+labels+release-groups+recording-level-rels+work-level-rels+artist-rels+work-rels';
  let release: any = null;

  // The barcode identifies this exact pressing, when Spotify shares it.
  if (album.upc) {
    const byCode = await mb<{ releases?: any[] }>(`/release?query=barcode:${encodeURIComponent(album.upc.replace(/^0+/, ''))}&limit=3`);
    if (byCode.releases?.[0]) release = await mb<any>(`/release/${byCode.releases[0].id}?${inc}`);
  }

  let groupId: string | undefined = release?.['release-group']?.id;
  if (!release || creditCount(release) === 0) {
    // Otherwise match the album itself, then read whichever edition carries the credits.
    if (!groupId) {
      const title = cleanTitle(album.name);
      const found = await mb<{ 'release-groups'?: any[] }>(`/release-group?query=releasegroup:${q(title)}%20AND%20artist:${q(album.artist)}&limit=5`);
      const group = (found['release-groups'] || []).find(
        (g) => g.score >= 85 && norm(g.title) === norm(title) && (g['artist-credit'] || []).some((c: any) => sameName(c.name, album.artist) || sameName(c.artist?.name || '', album.artist)),
      );
      groupId = group?.id;
    }
    if (!groupId) return release ? shape(release, undefined) : null;
    const editions = await mb<{ releases?: any[] }>(`/release?release-group=${groupId}&status=official&limit=25`);
    const candidates = (editions.releases || []).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 2);
    for (const c of candidates) {
      const full = await mb<any>(`/release/${c.id}?${inc}`);
      if (!release || creditCount(full) > creditCount(release)) release = full;
      if (creditCount(release) > 0) break;
    }
  }
  if (!release) return null;

  let wikidata: string | undefined;
  if (groupId) {
    const group = await mb<any>(`/release-group/${groupId}?inc=url-rels`).catch(() => null);
    wikidata = linksFrom(group?.relations).wikidata;
  }
  return shape(release, wikidata);
}

function shape(release: any, wikidata: string | undefined): MbAlbum {
  return {
    facts: albumFacts(release),
    credits: creditsFrom(release),
    links: [{ label: 'MusicBrainz', url: `https://musicbrainz.org/release/${release.id}` }],
    wikidata,
  };
}
