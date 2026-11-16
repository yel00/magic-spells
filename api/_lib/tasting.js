// The tasting session's prompt, answer shape and guard rails, kept apart from
// the request handler so they can be tested without calling the model.
import { z } from 'zod';

export const LIMITS = { seeds: 8, text: 200, note: 400, perDay: 30 };

const text = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Check what the app sent. Returns { seeds, note, count } or null if it is unusable. */
export function cleanRequest(body) {
  if (!body || !Array.isArray(body.seeds)) return null;
  const seeds = body.seeds
    .slice(0, LIMITS.seeds)
    .map((s) => ({ title: text(s?.title, LIMITS.text), artist: text(s?.artist, LIMITS.text), album: text(s?.album, LIMITS.text), year: text(s?.year, 4) }))
    .filter((s) => s.title && s.artist);
  if (!seeds.length) return null;
  const count = Math.min(5, Math.max(3, Math.round(Number(body.count)) || 4));
  return { seeds, note: text(body.note, LIMITS.note), count };
}

export const TastingSchema = z.object({
  title: z.string().describe('A short name for this session, 2 to 5 words, no quotation marks'),
  summary: z.string().describe('One or two sentences on the thread that runs through the listener’s songs'),
  shared: z
    .array(z.object({ feature: z.string().describe('A short label, e.g. "Bass carries the melody"'), description: z.string().describe('What it is and where it shows up in the listener’s songs, in plain language') }))
    .describe('Two to four concrete, audible features the listener’s songs share'),
  picks: z.array(
    z.object({
      title: z.string().describe('The song’s exact title as it appears on streaming services'),
      artist: z.string().describe('The primary artist only, exactly as credited'),
      genre: z.string().describe('The genre or tradition this song comes from, 1 to 3 words'),
      year: z.string().describe('Year of release, or an empty string if unsure'),
      familiarity: z.enum(['well known', 'deep cut']),
      shares: z.string().describe('Which of the shared features this song has, using the same labels'),
      why: z.string().describe('Two or three sentences on why it was chosen, tying it back to the listener’s songs'),
      listen_for: z.array(z.string()).describe('Two or three specific things to notice while listening'),
    }),
  ),
});

export const SYSTEM = `You are the guide for a music tasting session inside a personal music app. A tasting works like a wine flight: the listener tells you a few songs they like, you work out what those songs have in common as sound, and you pour them a small flight of songs from very different genres that share those same qualities. The point is to help them hear a familiar quality in unfamiliar music, and to say clearly what to listen for.

How to choose the shared features:
- Describe things a person can actually hear: how the rhythm sits, what the bass or drums are doing, how chords move, the texture of the production, how the voice is used, how the song builds or holds back. A genre name, a mood word on its own, or "great songwriting" is not a feature.
- Say where each feature shows up in the songs they gave you, so they can check it against their own ears.

How to choose the flight:
- Every pick must come from a different genre or tradition from the others, and from a different genre than the listener's songs. Reaching across eras, countries and languages is welcome.
- No artist who appears in the listener's songs, and no artist twice.
- Mix well-known songs with deep cuts.
- Each pick has to clearly show at least one of the shared features. A looser fit that needs special pleading is worse than a less surprising pick that plainly has it.
- Only choose real, released songs that you are confident exist, and give the exact title and the primary artist as a streaming service would list them. The app looks every pick up on Spotify and silently drops any it cannot find, so a misremembered title wastes a slot. This is why you are asked for a couple more candidates than will be shown.

How to write it:
- Plain, warm, specific language for a curious listener, not a musicologist. If you use a technical term, say what it means in the same sentence.
- For "what to listen for", point at moments and sounds: an instrument entering, a change in the rhythm, a texture. Give a rough time mark only when you are confident of it; otherwise describe the moment ("when the second verse starts").
- Do not flatter the listener's taste or pad the answer.`;

export function buildPrompt({ seeds, note, count }) {
  const lines = seeds.map((s, i) => `${i + 1}. "${s.title}" by ${s.artist}${s.album ? `, from ${s.album}` : ''}${s.year ? ` (${s.year})` : ''}`);
  return [
    'Songs I like:',
    ...lines,
    note ? `\nWhat I think I like about them: ${note}` : '',
    `\nFind what these share, then give me ${count + 2} candidate songs for the flight (the app will show the first ${count} it can find on Spotify), ordered so the flight flows well as a listening sequence.`,
  ].filter(Boolean).join('\n');
}

/** Is this Spotify account allowed to spend the owner's AI credit? Unset means anyone who can sign in. */
export function isAllowed(userId, allowList) {
  const list = String(allowList || '').split(',').map((s) => s.trim()).filter(Boolean);
  return !list.length || list.includes(userId);
}

/** A simple per-person daily cap, so a shared deployment can't run up the owner's bill. */
export function takeQuota(used, userId, now = Date.now(), limit = LIMITS.perDay) {
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `${userId}|${day}`;
  for (const k of used.keys()) if (!k.endsWith(day)) used.delete(k);
  const n = used.get(key) || 0;
  if (n >= limit) return false;
  used.set(key, n + 1);
  return true;
}
