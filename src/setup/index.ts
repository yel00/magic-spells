// The optional extras a copy of the app can switch on, and how its owner does it.

export type SetupStatus = {
  genius: boolean;
  lastfm: boolean;
  youtube: boolean;
  concerts: boolean;
  setlists: boolean;
  sync: boolean;
  photos: boolean;
  ai: boolean;
  aiNamedOnly: boolean;
};

export type Extra = {
  id: Exclude<keyof SetupStatus, 'aiNamedOnly'>;
  name: string;
  /** What switching it on adds. */
  adds: string;
  /** What happens without it. */
  without: string;
  /** The setting to add on the host. */
  setting: string;
  /** Where the key comes from. */
  where: string;
  link: string;
  cost: string;
};

export const EXTRAS: Extra[] = [
  { id: 'genius', name: 'Song background', adds: 'Writers, producers, samples and the story behind a song.', without: 'About this song shows less.', setting: 'GENIUS_ACCESS_TOKEN', where: 'Genius: create an API client, then Generate Access Token', link: 'https://genius.com/api-clients', cost: 'Free' },
  { id: 'sync', name: 'Notes, tags and concerts on all your devices', adds: 'Notes, tags, the concerts you were at, your concert area and your search history follow you between devices.', without: 'They stay on the device they were written on.', setting: 'DATABASE_URL', where: 'Vercel: Storage → Create Database → Neon, connect it to the project', link: 'https://vercel.com/dashboard', cost: 'Free tier' },
  { id: 'photos', name: 'Concert pictures on all your devices', adds: 'Pictures you add to a show appear on your other devices. Needs the database above as well.', without: 'Pictures stay on the device they were added on.', setting: 'BLOB_READ_WRITE_TOKEN', where: 'Vercel: Storage → Create Database → Blob, connect it to the project (it adds the setting itself)', link: 'https://vercel.com/dashboard', cost: 'Free tier' },
  { id: 'lastfm', name: 'Better suggestions', adds: 'Stronger similar-artist data for Discover and the maps.', without: 'Suggestions use ListenBrainz, which needs no key.', setting: 'LASTFM_API_KEY', where: 'Last.fm: create an API account', link: 'https://www.last.fm/api/account/create', cost: 'Free' },
  { id: 'youtube', name: 'Videos inside the app', adds: 'Live performances play without leaving the app.', without: 'The app links out to YouTube.', setting: 'YOUTUBE_API_KEY', where: 'Google Cloud: enable YouTube Data API v3, create an API key', link: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com', cost: 'Free, about 100 searches a day' },
  { id: 'concerts', name: 'Concerts near you', adds: 'Shows by artists you follow, near a place you choose.', without: 'The concert scanner is off.', setting: 'TICKETMASTER_API_KEY', where: 'Ticketmaster: register for a developer key', link: 'https://developer.ticketmaster.com', cost: 'Free' },
  { id: 'setlists', name: 'Past shows and setlists', adds: 'An artist’s past concerts, what they played, and recordings of each night.', without: 'Artist pages link out to setlist.fm.', setting: 'SETLISTFM_API_KEY', where: 'setlist.fm: sign in, then apply for an API key', link: 'https://www.setlist.fm/settings/api', cost: 'Free for personal use' },
  { id: 'ai', name: 'Tasting sessions', adds: 'An AI guide pours a flight of songs from different genres.', without: 'Tasting sessions are off.', setting: 'ANTHROPIC_API_KEY', where: 'Anthropic: create an API key', link: 'https://platform.claude.com/settings/keys', cost: 'A few cents a session' },
];

export const REPO_URL: string = (import.meta.env.VITE_REPO_URL as string | undefined) || 'https://github.com/yel00/magic-spells';

/** The one-click "make your own copy" link for a repository. */
export function deployUrl(repo: string = REPO_URL): string {
  return `https://vercel.com/new/clone?repository-url=${encodeURIComponent(repo)}&project-name=magic-spells&repository-name=magic-spells`;
}

/** Asks this copy's server what is switched on. Null when it can't be reached. */
export async function fetchSetup(): Promise<SetupStatus | null> {
  try {
    const r = await fetch('/api/status');
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    return (await r.json()) as SetupStatus;
  } catch {
    return null;
  }
}

/** How many extras are on, for the one-line summary. */
export function countOn(status: SetupStatus): number {
  return EXTRAS.filter((e) => status[e.id]).length;
}
