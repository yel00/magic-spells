// Your own pictures from a show. They are shrunk and kept on this device only.

export interface ShowPhoto {
  id: string;
  showId: string;
  added: number;
  blob: Blob;
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
    await run('readwrite', (s) => s.put({ id, showId, added: Date.now(), blob } satisfies ShowPhoto));
    added++;
  }
  return added;
}

export async function photosFor(showId: string): Promise<ShowPhoto[]> {
  const all = await run<ShowPhoto[]>('readonly', (s) => s.index('showId').getAll(showId));
  return all.sort((a, b) => a.added - b.added);
}

export function removePhoto(id: string): Promise<undefined> {
  return run('readwrite', (s) => s.delete(id));
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
