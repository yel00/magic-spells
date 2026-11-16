// What the listener has asked to leave off their music map: whole playlists
// (a children's playlist, sleep sounds) and individual artists.
import { norm } from '../enrich/text';
import { isDemo } from '../spotify/auth';

export interface Exclusions {
  /** Playlist names. */
  playlists: string[];
  /** Artists as { key, name }: the key is the normalised name used for matching. */
  artists: { key: string; name: string }[];
}

const KEY = () => `ms.map:exclude${isDemo() ? ':demo' : ''}`;

export function loadExclusions(): Exclusions {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY()) || 'null');
    return { playlists: saved?.playlists || [], artists: saved?.artists || [] };
  } catch {
    return { playlists: [], artists: [] };
  }
}

export function saveExclusions(e: Exclusions) {
  try {
    localStorage.setItem(KEY(), JSON.stringify(e));
  } catch {
    /* storage unavailable: exclusions last for this session */
  }
}

export function withArtist(e: Exclusions, name: string, excluded: boolean): Exclusions {
  const key = norm(name);
  const rest = e.artists.filter((a) => a.key !== key);
  return { ...e, artists: excluded ? [...rest, { key, name }] : rest };
}

export function withPlaylist(e: Exclusions, name: string, excluded: boolean): Exclusions {
  const rest = e.playlists.filter((p) => p !== name);
  return { ...e, playlists: excluded ? [...rest, name] : rest };
}
