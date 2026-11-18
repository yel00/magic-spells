import type { ShowSummary } from './types';

/** A show you were at, as synced: `deleted` means you un-marked it. */
export interface MarkedShow extends ShowSummary {
  updated_at: number;
  deleted: boolean;
}

export interface LocalShow extends MarkedShow {
  /** Has changes the server hasn't seen. */
  dirty?: boolean;
}

/** Lists saved before sync existed had no dates on them; treat those as fresh changes to send. */
export function adopt(saved: unknown, now: number): LocalShow[] {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((s) => s && typeof s.id === 'string')
    .map((s) => (typeof s.updated_at === 'number' ? s : { ...s, updated_at: now, deleted: false, dirty: true }));
}

/** Clear the "needs sending" mark on what was just sent, unless it was edited again meanwhile. */
export function markSent(local: LocalShow[], sent: MarkedShow[]): LocalShow[] {
  const at = new Map(sent.map((s) => [s.id, s.updated_at]));
  return local.map((s) => (s.dirty && at.get(s.id) === s.updated_at ? { ...s, dirty: false } : s));
}

/** Fold in what the server sent. The newer edit of each show wins. */
export function mergeShows(local: LocalShow[], remote: MarkedShow[]): LocalShow[] {
  const byId = new Map(local.map((s) => [s.id, s]));
  for (const r of remote) {
    const mine = byId.get(r.id);
    if (!mine || r.updated_at >= mine.updated_at) byId.set(r.id, { ...r, dirty: false });
  }
  return [...byId.values()];
}

export const live = (all: LocalShow[]): ShowSummary[] => all.filter((s) => !s.deleted).map(({ dirty: _d, deleted: _x, updated_at: _u, ...s }) => s);
