// Search history: what someone searched for and what they opened from the
// results. One list, merged entry by entry so two devices never overwrite each
// other: for each entry the newest change wins, and forgetting an entry is a
// change like any other. Used by both the server and the app.

export const LIMITS = { perKind: 30, entries: 240, text: 200, image: 600 };
/** A forgotten entry is remembered as forgotten for this long, so slow devices hear about it. */
const FORGET_FOR = 30 * 86_400_000;

const URI = /^spotify:(track|album|artist|playlist):[A-Za-z0-9_]{1,64}$/;
const text = (v) => (typeof v === 'string' ? v.slice(0, LIMITS.text) : '');

/** The same search typed twice, in different capitals or spacing, is one entry. */
export function searchKey(query) {
  return `q:${String(query ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 80)}`;
}

/** Check one entry. Returns a safe copy, or null if it is malformed. */
export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = Number.isFinite(raw.at) && raw.at > 0 && raw.at < 4e12 ? Math.round(raw.at) : null;
  if (!at) return null;
  const gone = !!raw.gone;
  if (raw.kind === 'search') {
    const title = text(raw.title).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!title) return null;
    return { key: searchKey(title), kind: 'search', title, at, ...(gone && { gone }) };
  }
  if (raw.kind === 'item' && URI.test(raw.uri)) {
    const title = text(raw.title);
    if (!title) return null;
    const image = typeof raw.image === 'string' && /^https:\/\//.test(raw.image) && raw.image.length <= LIMITS.image ? raw.image : null;
    return { key: raw.uri, kind: 'item', uri: raw.uri, title, sub: text(raw.sub), image, at, ...(gone && { gone }) };
  }
  return null;
}

/**
 * One list from two. For each entry the newest change wins. Each kind keeps
 * its newest few; old "forgotten" markers are dropped. Newest first.
 */
export function mergeHistory(mine, theirs, now = Date.now()) {
  const byKey = new Map();
  for (const raw of [...(Array.isArray(mine) ? mine : []), ...(Array.isArray(theirs) ? theirs : [])]) {
    const e = cleanEntry(raw);
    if (!e) continue;
    const seen = byKey.get(e.key);
    if (!seen || e.at > seen.at) byKey.set(e.key, { ...e, at: Math.min(e.at, now + 60_000) });
  }
  const all = [...byKey.values()].sort((a, b) => b.at - a.at);
  const kept = [];
  const count = { search: 0, item: 0 };
  for (const e of all) {
    if (e.gone) {
      if (now - e.at < FORGET_FOR) kept.push(e);
    } else if (count[e.kind] < LIMITS.perKind) {
      count[e.kind]++;
      kept.push(e);
    }
  }
  return kept.slice(0, LIMITS.entries);
}

/** Fold a device's list into what is stored, store the result and return it. `db` is anything with pg's query(text, params). */
export async function syncHistory(db, userId, incoming) {
  const { rows } = await db.query("SELECT value FROM prefs WHERE user_id = $1 AND key = 'history'", [userId]);
  const merged = mergeHistory(rows[0]?.value?.entries, Array.isArray(incoming) ? incoming.slice(0, LIMITS.entries) : []);
  await db.query(
    `INSERT INTO prefs (user_id, key, value, updated_at) VALUES ($1,'history',$2,$3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [userId, JSON.stringify({ entries: merged }), Date.now()],
  );
  return { entries: merged };
}
