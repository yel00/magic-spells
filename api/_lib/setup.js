// Which optional services this copy has switched on. Only yes/no answers
// leave the server: never a key, or any part of one.
import { readApiKey } from './tasting.js';

const has = (env, name) => !!String(env[name] ?? '').trim();

export function setupStatus(env) {
  return {
    genius: has(env, 'GENIUS_ACCESS_TOKEN'),
    lastfm: has(env, 'LASTFM_API_KEY'),
    youtube: has(env, 'YOUTUBE_API_KEY'),
    concerts: has(env, 'TICKETMASTER_API_KEY'),
    setlists: has(env, 'SETLISTFM_API_KEY'),
    sync: has(env, 'DATABASE_URL'),
    ai: !!readApiKey(env),
    aiNamedOnly: has(env, 'AI_ALLOWED_USERS'),
  };
}
