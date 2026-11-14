import { useSyncExternalStore } from 'react';

export interface Route {
  name: string;
  id?: string;
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'home', id: parts[1] ? decodeURIComponent(parts[1]) : undefined };
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

export function go(path: string) {
  window.location.hash = path;
}

/** Turn a Spotify URI (spotify:album:xyz) into an in-app path, or null if we have no page for it. */
export function pathForUri(uri: string | undefined | null): string | null {
  if (!uri) return null;
  const [, type, id] = uri.split(':');
  if (!id) return null;
  if (type === 'album' || type === 'artist' || type === 'playlist') return `/${type}/${id}`;
  return null;
}
