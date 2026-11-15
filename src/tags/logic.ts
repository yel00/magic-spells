export interface Tagging {
  subject_uri: string;
  tag: string;
  title: string;
  subtitle: string;
  image: string | null;
  updated_at: number;
  deleted: boolean;
}

export interface LocalTagging extends Tagging {
  /** Has changes the server hasn't seen. */
  dirty?: boolean;
}

export type TagSubject = Pick<Tagging, 'subject_uri' | 'title' | 'subtitle' | 'image'>;

/** Tags are compared in lower case with single spaces, so "Late Night" and "late  night" are one tag. */
export function normalizeTag(raw: string): string {
  // eslint-disable-next-line no-control-regex
  return raw.toLowerCase().replace(/[\u0000-\u001f#,]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

const keyOf = (t: { subject_uri: string; tag: string }) => `${t.subject_uri}|${t.tag}`;

/** Fold the server's taggings into this device's. An unsent local change survives unless the server's is newer. */
export function mergeTags(local: LocalTagging[], incoming: Tagging[]): LocalTagging[] {
  const by = new Map(local.map((t) => [keyOf(t), t]));
  for (const s of incoming) {
    const mine = by.get(keyOf(s));
    if (!mine || !mine.dirty || s.updated_at >= mine.updated_at) by.set(keyOf(s), { ...s, dirty: false });
  }
  return [...by.values()];
}

export function markTagsSent(local: LocalTagging[], sent: Tagging[]): LocalTagging[] {
  const at = new Map(sent.map((t) => [keyOf(t), t.updated_at]));
  return local.map((t) => (t.dirty && at.get(keyOf(t)) === t.updated_at ? { ...t, dirty: false } : t));
}

export function tagsOn(all: LocalTagging[], uri: string): string[] {
  return all.filter((t) => !t.deleted && t.subject_uri === uri).map((t) => t.tag).sort();
}

/** Every tag in use with how many things carry it, most used first. */
export function tagCounts(all: LocalTagging[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of all) if (!t.deleted) counts.set(t.tag, (counts.get(t.tag) || 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The things that carry every one of the given tags, most recently tagged first. */
export function taggedWith(all: LocalTagging[], tags: string[]): TagSubject[] {
  if (!tags.length) return [];
  const by = new Map<string, { subject: TagSubject; has: Set<string>; at: number }>();
  for (const t of all) {
    if (t.deleted) continue;
    const e = by.get(t.subject_uri) || by.set(t.subject_uri, { subject: { subject_uri: t.subject_uri, title: t.title, subtitle: t.subtitle, image: t.image }, has: new Set(), at: 0 }).get(t.subject_uri)!;
    e.has.add(t.tag);
    e.at = Math.max(e.at, t.updated_at);
  }
  return [...by.values()].filter((e) => tags.every((t) => e.has.has(t))).sort((a, b) => b.at - a.at).map((e) => e.subject);
}
