// What you searched for and what you opened from the results. Saved on the
// device at once, then shared with your other devices through the same server
// as notes.
import { mergeHistory, searchKey, type HistoryEntry } from '../../api/_lib/history.js';
import { createStore } from '../lib/store';
import { getAccessToken, isDemo } from '../spotify/auth';

export type { HistoryEntry };

interface HistoryState {
  searches: HistoryEntry[];
  opened: HistoryEntry[];
}

export const history = createStore<HistoryState>({ searches: [], opened: [] });

let key = '';
let all: HistoryEntry[] = [];
let dirty = false;
let unconfigured = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;

function publish(next: HistoryEntry[], changed: boolean) {
  all = mergeHistory(next, []);
  if (changed) dirty = true;
  history.set({ searches: all.filter((e) => e.kind === 'search' && !e.gone), opened: all.filter((e) => e.kind === 'item' && !e.gone) });
  try {
    localStorage.setItem(key, JSON.stringify({ entries: all, dirty }));
  } catch {
    /* storage unavailable: history lasts for this session */
  }
}

export function openHistory(userId: string) {
  key = `ms.history:${isDemo() ? 'demo' : userId}`;
  let saved: { entries?: HistoryEntry[]; dirty?: boolean } = {};
  try {
    saved = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    /* unreadable: start empty */
  }
  dirty = !!saved.dirty;
  publish(saved.entries || [], false);
  syncHistory();
}

function change(entries: HistoryEntry[]) {
  if (!key) return;
  publish([...entries, ...all], true);
  clearTimeout(timer);
  timer = setTimeout(syncHistory, 1500);
}

/** Remember a search. Very short ones aren't worth keeping. */
export function rememberSearch(query: string) {
  const title = query.replace(/\s+/g, ' ').trim();
  if (title.length < 2) return;
  change([{ key: searchKey(title), kind: 'search', title, at: Date.now() }]);
}

/** Remember something opened from the search results. */
export function rememberOpened(item: { uri: string; title: string; sub: string; image?: string | null }) {
  change([{ key: item.uri, kind: 'item', uri: item.uri, title: item.title, sub: item.sub, image: item.image || null, at: Date.now() }]);
}

export function forget(entry: HistoryEntry) {
  change([{ ...entry, at: Date.now(), gone: true }]);
}

export function clearHistory(kind: HistoryEntry['kind']) {
  const now = Date.now();
  change(all.filter((e) => e.kind === kind && !e.gone).map((e) => ({ ...e, at: now, gone: true })));
}

export function syncHistory(): Promise<void> {
  if (!key || isDemo() || unconfigured) return Promise.resolve();
  if (running) return running.then(() => (dirty ? syncHistory() : undefined));
  running = (async () => {
    const sent = all;
    try {
      const res = await fetch('/api/notes?kind=history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ entries: sent }),
      });
      if (res.status === 501 || !res.headers.get('content-type')?.includes('json')) {
        unconfigured = true;
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries: HistoryEntry[] };
      // Anything changed here while the request was away is still newer, and stays to be sent.
      const changedMeanwhile = all !== sent;
      dirty = changedMeanwhile;
      publish([...all, ...data.entries], false);
    } catch {
      /* offline: try again next time */
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncHistory();
  });
}
