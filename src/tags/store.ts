// Personal tags. Saved on the device the moment they are added; synced to the
// listener's other devices through the same server as listening notes.
import { createStore } from '../lib/store';
import { getAccessToken, isDemo } from '../spotify/auth';
import { markTagsSent, mergeTags, normalizeTag, type LocalTagging, type Tagging, type TagSubject } from './logic';

interface TagState {
  tags: LocalTagging[];
  synced: 'device' | 'synced' | 'offline' | 'unconfigured';
}

export const tags = createStore<TagState>({ tags: [], synced: 'device' });

let key = '';
let rev = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;

function persist() {
  try {
    localStorage.setItem(key, JSON.stringify({ rev, tags: tags.get().tags }));
  } catch {
    /* storage unavailable: tags last for this session */
  }
}

export function openTags(userId: string) {
  key = `ms.tags:${isDemo() ? 'demo' : userId}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    rev = saved?.rev || 0;
    tags.set({ tags: saved?.tags || [] });
  } catch {
    rev = 0;
    tags.set({ tags: [] });
  }
  syncTags();
}

function commit(next: LocalTagging[]) {
  tags.set({ tags: next });
  persist();
  clearTimeout(timer);
  timer = setTimeout(syncTags, 1200);
}

/** Add or remove one tag on one thing. Returns the tag as stored, or '' if it was empty. */
export function setTag(subject: TagSubject, rawTag: string, on: boolean): string {
  const tag = normalizeTag(rawTag);
  if (!tag) return '';
  const all = tags.get().tags;
  const entry: LocalTagging = { ...subject, tag, updated_at: Date.now(), deleted: !on, dirty: true };
  const exists = all.some((t) => t.subject_uri === subject.subject_uri && t.tag === tag);
  commit(exists ? all.map((t) => (t.subject_uri === subject.subject_uri && t.tag === tag ? entry : t)) : [...all, entry]);
  return tag;
}

export function syncTags(): Promise<void> {
  if (!key || isDemo() || tags.get().synced === 'unconfigured') return Promise.resolve();
  if (running) return running.then(() => (tags.get().tags.some((t) => t.dirty) ? syncTags() : undefined));
  running = (async () => {
    const changes: Tagging[] = tags.get().tags.filter((t) => t.dirty).map(({ dirty: _d, ...t }) => t);
    try {
      const res = await fetch('/api/notes?kind=tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ since: rev, changes }),
      });
      const isJson = res.headers.get('content-type')?.includes('json');
      if (res.status === 501 || !isJson) {
        tags.set({ synced: 'unconfigured' });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { rev: number; tags: Tagging[] };
      rev = data.rev;
      tags.set({ tags: mergeTags(markTagsSent(tags.get().tags, changes), data.tags), synced: 'synced' });
      persist();
    } catch {
      tags.set({ synced: 'offline' });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncTags();
  });
}
