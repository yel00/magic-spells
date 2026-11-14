import type { LocalNote, Note } from './types';

/**
 * Fold notes from the server into this device's notes. A local note with
 * unsent edits survives unless the server's copy was edited more recently.
 */
export function mergeNotes(local: LocalNote[], incoming: Note[]): LocalNote[] {
  const byId = new Map(local.map((n) => [n.id, n]));
  for (const server of incoming) {
    const mine = byId.get(server.id);
    if (!mine || !mine.dirty || server.updated_at >= mine.updated_at) byId.set(server.id, { ...server, dirty: false });
  }
  return [...byId.values()];
}

/** After a successful sync, a note is clean only if it wasn't edited again while the request was in flight. */
export function markSent(local: LocalNote[], sent: Note[]): LocalNote[] {
  const sentAt = new Map(sent.map((n) => [n.id, n.updated_at]));
  return local.map((n) => (n.dirty && sentAt.get(n.id) === n.updated_at ? { ...n, dirty: false } : n));
}

export function notesAbout(notes: LocalNote[], uri: string): LocalNote[] {
  return notes
    .filter((n) => !n.deleted && (n.subject_uri === uri || n.parent_uri === uri))
    .sort((a, b) => b.created_at - a.created_at);
}

export function searchNotes(notes: LocalNote[], query: string): LocalNote[] {
  const q = query.trim().toLowerCase();
  return notes
    .filter((n) => !n.deleted && (!q || `${n.body} ${n.title} ${n.subtitle}`.toLowerCase().includes(q)))
    .sort((a, b) => b.updated_at - a.updated_at);
}
