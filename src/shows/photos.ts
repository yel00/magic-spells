// Your own pictures from a show. They are shrunk and saved on the device
// straight away; when picture storage is set up on the server they are also
// copied there, so they appear on your other devices.
import { createStore } from '../lib/store';
import { getAccessToken } from '../spotify/auth';

export interface ShowPhoto {
  id: string;
  showId: string;
  added: number;
  blob: Blob;
  /** The account that added it. Pictures from before syncing existed have none and go to whoever is signed in. */
  user?: string;
  /** Already copied to the server. */
  synced?: boolean;
}

/** Bumped whenever pictures arrive from or leave for another device, so open pages reload them. */
export const photoSync = createStore<{ tick: number; status: 'device' | 'synced' | 'offline' | 'unconfigured' }>({ tick: 0, status: 'device' });

let user = '';
const goneKey = () => `ms.photos.gone:${user}`;

function gone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(goneKey()) || '[]') as string[];
  } catch {
    return [];
  }
}

function setGone(ids: string[]) {
  try {
    localStorage.setItem(goneKey(), JSON.stringify(ids));
  } catch {
    /* storage unavailable */
  }
}

export function openPhotos(userId: string) {
  user = userId;
}

const MAX_SIDE = 1600;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ms-shows', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' }).createIndex('showId', 'showId');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction('photos', mode).objectStore('photos'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** The size a picture is shrunk to: the long side at most `max`, never enlarged. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function shrink(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return out || file;
  } catch {
    // A format the browser can't redraw: keep the original.
    return file;
  }
}

export async function addPhotos(showId: string, files: File[]): Promise<number> {
  let added = 0;
  for (const file of files.filter((f) => f.type.startsWith('image/'))) {
    const blob = await shrink(file);
    const id = `${showId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await run('readwrite', (s) => s.put({ id, showId, added: Date.now(), blob, user } satisfies ShowPhoto));
    added++;
  }
  if (added) {
    photoSync.set({ tick: photoSync.get().tick + 1 });
    void syncPhotos();
  }
  return added;
}

export async function photosFor(showId: string): Promise<ShowPhoto[]> {
  const all = await run<ShowPhoto[]>('readonly', (s) => s.index('showId').getAll(showId));
  return all.sort((a, b) => a.added - b.added);
}

export async function removePhoto(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  // Remembered until the server has been told, so the picture leaves your other devices too.
  setGone([...new Set([...gone(), id])]);
  photoSync.set({ tick: photoSync.get().tick + 1 });
  void syncPhotos();
}

export interface RemotePhoto {
  id: string;
  show_id: string;
  added: number;
  deleted: boolean;
}

/** Works out what one device has to do to match the server: what to drop, fetch and send. */
export function planPhotoSync(local: Pick<ShowPhoto, 'id' | 'synced'>[], remote: RemotePhoto[], removedHere: string[]) {
  const here = new Set(local.map((p) => p.id));
  const there = new Map(remote.map((r) => [r.id, r]));
  const removed = new Set(removedHere);
  return {
    drop: local.filter((p) => there.get(p.id)?.deleted).map((p) => p.id),
    fetch: remote.filter((r) => !r.deleted && !here.has(r.id) && !removed.has(r.id)),
    send: local.filter((p) => !there.has(p.id)).map((p) => p.id),
    markSynced: local.filter((p) => !p.synced && there.has(p.id) && !there.get(p.id)!.deleted).map((p) => p.id),
  };
}

let running: Promise<void> | null = null;
let again = false;

/** Copies pictures between this device and the server. Does nothing when picture storage isn't set up. */
export function syncPhotos(): Promise<void> {
  if (!user || user === 'demo' || photoSync.get().status === 'unconfigured') return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      const auth = { Authorization: `Bearer ${await getAccessToken()}` };
      const removedHere = gone();
      const res = await fetch('/api/photos', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ deleted: removedHere }) });
      if (res.status === 501 || !res.headers.get('content-type')?.includes('json')) {
        photoSync.set({ status: 'unconfigured' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const { photos: remote } = (await res.json()) as { photos: RemotePhoto[] };
      setGone(gone().filter((id) => !removedHere.includes(id)));

      const mine = (await run<ShowPhoto[]>('readonly', (s) => s.getAll())).filter((p) => !p.user || p.user === user);
      const plan = planPhotoSync(mine, remote, gone());
      let changed = false;
      for (const id of plan.drop) {
        await run('readwrite', (s) => s.delete(id));
        changed = true;
      }
      for (const id of plan.markSynced) {
        const p = mine.find((x) => x.id === id)!;
        await run('readwrite', (s) => s.put({ ...p, user, synced: true }));
      }
      for (const r of plan.fetch) {
        const got = await fetch(`/api/photos?id=${encodeURIComponent(r.id)}`, { headers: auth });
        if (!got.ok) continue;
        const blob = await got.blob();
        await run('readwrite', (s) => s.put({ id: r.id, showId: r.show_id, added: r.added, blob, user, synced: true } satisfies ShowPhoto));
        changed = true;
      }
      for (const id of plan.send) {
        const p = mine.find((x) => x.id === id)!;
        const put = await fetch(`/api/photos?id=${encodeURIComponent(id)}&added=${p.added}`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/octet-stream' }, body: p.blob });
        if (put.ok) await run('readwrite', (s) => s.put({ ...p, user, synced: true }));
      }
      photoSync.set({ status: 'synced', tick: photoSync.get().tick + (changed ? 1 : 0) });
    } catch {
      photoSync.set({ status: 'offline' });
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncPhotos();
    }
  });
  return running;
}

/** Which shows have pictures, so the list of your shows can say so. */
export async function showsWithPhotos(): Promise<Set<string>> {
  try {
    const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
    return new Set(keys.map((k) => String(k).split(':')[0]));
  } catch {
    return new Set();
  }
}
