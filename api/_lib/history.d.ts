export interface HistoryEntry {
  /** What makes it the same entry: the search words, or the Spotify address of what was opened. */
  key: string;
  kind: 'search' | 'item';
  title: string;
  /** When it was last used, or forgotten. */
  at: number;
  /** Forgotten: kept only so other devices drop it too. */
  gone?: boolean;
  uri?: string;
  sub?: string;
  image?: string | null;
}
export const LIMITS: { perKind: number; entries: number; text: number; image: number };
export function searchKey(query: string): string;
export function cleanEntry(raw: unknown): HistoryEntry | null;
export function mergeHistory(mine: unknown, theirs: unknown, now?: number): HistoryEntry[];
export function syncHistory(db: { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }, userId: string, incoming: unknown): Promise<{ entries: HistoryEntry[] }>;
