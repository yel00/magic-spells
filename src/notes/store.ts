// Listening notes. They are saved on the device the moment you write them, so
// they work offline and without any server; when a server is set up they sync
// to your other devices in the background.
import { createStore } from '../lib/store';
import { getAccessToken, isDemo } from '../spotify/auth';
import { markSent, mergeNotes } from './merge';
import type { LocalNote, Note, NoteSubject } from './types';

export type SyncStatus = 'device' | 'syncing' | 'synced' | 'offline' | 'unconfigured';

interface NotesState {
  notes: LocalNote[];
  status: SyncStatus;
}

export const notes = createStore<NotesState>({ notes: [], status: 'device' });

let key = '';
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing: Promise<void> | null = null;

interface Saved {
  rev: number;
  notes: LocalNote[];
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    /* unreadable: start empty rather than crash */
  }
  return { rev: 0, notes: [] };
}

let rev = 0;

function persist() {
  try {
    localStorage.setItem(key, JSON.stringify({ rev, notes: notes.get().notes } satisfies Saved));
  } catch {
    /* storage full or unavailable: notes stay in memory for this session */
  }
}

/** Open the notebook for this Spotify account. Each account on a device keeps its own. */
export function openNotes(userId: string) {
  key = `ms.notes:${isDemo() ? 'demo' : userId}`;
  const saved = load();
  rev = saved.rev;
  notes.set({ notes: saved.notes, status: isDemo() ? 'device' : notes.get().status });
  sync();
}

function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function commit(next: LocalNote[]) {
  notes.set({ notes: next });
  persist();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 1200);
}

export function saveNote(subject: NoteSubject, body: string, id?: string) {
  const now = Date.now();
  const all = notes.get().notes;
  const existing = id ? all.find((n) => n.id === id) : undefined;
  if (existing) {
    commit(all.map((n) => (n.id === id ? { ...n, body, updated_at: now, dirty: true } : n)));
  } else {
    commit([...all, { ...subject, id: uuid(), body, created_at: now, updated_at: now, deleted: false, dirty: true }]);
  }
}

export function deleteNote(id: string) {
  // Keep a marker so the deletion reaches other devices instead of the note reappearing.
  commit(notes.get().notes.map((n) => (n.id === id ? { ...n, body: '', deleted: true, updated_at: Date.now(), dirty: true } : n)));
}

export function sync(): Promise<void> {
  if (!key || isDemo() || notes.get().status === 'unconfigured') return Promise.resolve();
  if (syncing) return syncing.then(() => (notes.get().notes.some((n) => n.dirty) ? sync() : undefined));
  syncing = (async () => {
    const changes: Note[] = notes.get().notes.filter((n) => n.dirty).map(({ dirty: _d, ...n }) => n);
    notes.set({ status: 'syncing' });
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ since: rev, changes }),
      });
      const isJson = res.headers.get('content-type')?.includes('json');
      if (res.status === 501 || (res.status === 404 && !isJson) || (res.ok && !isJson)) {
        notes.set({ status: 'unconfigured' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { rev: number; notes: Note[] };
      rev = data.rev;
      notes.set({ notes: mergeNotes(markSent(notes.get().notes, changes), data.notes), status: 'synced' });
      persist();
    } catch {
      notes.set({ status: 'offline' });
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

export const STATUS_TEXT: Record<SyncStatus, string> = {
  device: 'Saved on this device',
  syncing: 'Syncing…',
  synced: 'Synced across your devices',
  offline: 'Saved on this device — will sync when the connection is back',
  unconfigured: 'Saved on this device only — sync isn’t set up yet',
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync();
  });
  window.addEventListener('online', () => sync());
}
