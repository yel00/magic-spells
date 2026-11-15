// Tabs: links to the licensed tab sites for a song, and a small library of tab
// files (Guitar Pro, MusicXML) the listener has imported, kept on the device.
import { cached, Provisional } from '../enrich/cache';
import { cleanTitle, norm } from '../enrich/text';
import { isDemo } from '../spotify/auth';

export interface TabHit {
  id: number;
  title: string;
  artist: string;
  url: string;
  parts: string[];
  chords: boolean;
}

/** Songsterr tabs for a song (via our server), or null when there are none or the server isn't reachable. */
export function findTabs(title: string, artist: string): Promise<TabHit[] | null> {
  if (isDemo()) return Promise.resolve(null);
  return cached(`tabs:${norm(artist)}:${norm(title)}`, async () => {
    try {
      const res = await fetch(`/api/tabs?title=${encodeURIComponent(cleanTitle(title))}&artist=${encodeURIComponent(artist)}`);
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error('unavailable');
      const data = (await res.json()) as { tabs: TabHit[] };
      return data.tabs.length ? data.tabs : null;
    } catch {
      throw new Provisional(null);
    }
  });
}

export function tabSearchLinks(title: string, artist: string): { label: string; url: string }[] {
  const q = encodeURIComponent(`${artist} ${cleanTitle(title)}`);
  return [
    { label: 'Songsterr', url: `https://www.songsterr.com/?pattern=${q}` },
    { label: 'Ultimate Guitar', url: `https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}` },
    { label: 'MuseScore (piano)', url: `https://musescore.com/sheetmusic?text=${q}` },
  ];
}

// ---- Imported tab files (IndexedDB) -------------------------------------------

export interface TabFile {
  id: string;
  name: string;
  /** Song this file was imported for, if any. */
  trackUri: string | null;
  title: string;
  artist: string;
  added: number;
  bytes: ArrayBuffer;
}

export const TAB_TYPES = ['gp', 'gp3', 'gp4', 'gp5', 'gpx', 'xml', 'musicxml', 'mxl', 'capx'];
export const TAB_ACCEPT = TAB_TYPES.map((t) => `.${t}`).join(',');

export function isTabFile(name: string): boolean {
  return TAB_TYPES.includes(name.split('.').pop()?.toLowerCase() || '');
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ms-tabs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tabs', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction('tabs', mode).objectStore('tabs'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const listTabs = () => run<TabFile[]>('readonly', (s) => s.getAll()).then((all) => all.sort((a, b) => b.added - a.added));
export const getTab = (id: string) => run<TabFile | undefined>('readonly', (s) => s.get(id));
export const deleteTab = (id: string) => run('readwrite', (s) => s.delete(id));

export async function importTab(file: File, song?: { uri: string; title: string; artist: string }): Promise<TabFile> {
  if (!isTabFile(file.name)) throw new Error('That isn’t a tab file. Use Guitar Pro (.gp, .gp3–.gp5, .gpx) or MusicXML (.musicxml, .xml, .mxl).');
  if (file.size > 15 * 1024 * 1024) throw new Error('That file is too large (15 MB limit).');
  const tab: TabFile = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    trackUri: song?.uri ?? null,
    title: song?.title ?? file.name.replace(/\.[^.]+$/, ''),
    artist: song?.artist ?? '',
    added: Date.now(),
    bytes: await file.arrayBuffer(),
  };
  await run('readwrite', (s) => s.put(tab));
  return tab;
}
