// Spotify sign-in using Authorization Code + PKCE. There is no client secret,
// so nothing sensitive ships in the app and no server is needed to log in.

const KEY = {
  clientId: 'ms.clientId',
  token: 'ms.token',
  pkce: 'ms.pkce',
  demo: 'ms.demo',
};

export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'user-follow-read',
  'user-follow-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
];

interface Token {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: sign-in simply won't persist */
  }
}

export function getClientId(): string {
  return (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || read<string>(KEY.clientId) || '';
}

export function setClientId(id: string) {
  write(KEY.clientId, id.trim() || null);
}

export function redirectUri(): string {
  return window.location.origin + '/';
}

export function isDemo(): boolean {
  return read<boolean>(KEY.demo) === true;
}

export function setDemo(on: boolean) {
  write(KEY.demo, on ? true : null);
}

export function isSignedIn(): boolean {
  return isDemo() || !!read<Token>(KEY.token)?.refresh_token;
}

export function signOut() {
  write(KEY.token, null);
  write(KEY.demo, null);
}

export function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

function randomString(bytes: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function beginLogin(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Add your Spotify client ID first.');
  const verifier = randomString(64);
  const state = randomString(16);
  write(KEY.pkce, { verifier, state });
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
    scope: SCOPES.join(' '),
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function tokenRequest(body: Record<string, string>): Promise<Token> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || `Spotify sign-in failed (${res.status})`);
  const prev = read<Token>(KEY.token);
  const token: Token = {
    access_token: json.access_token,
    // Spotify may or may not rotate the refresh token; keep the old one if it doesn't.
    refresh_token: json.refresh_token || prev?.refresh_token || '',
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
  };
  write(KEY.token, token);
  return token;
}

/**
 * If this page load is Spotify sending the user back, finish the sign-in.
 * Returns an error message to show, or null.
 */
export async function completeLoginIfReturning(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;
  const pkce = read<{ verifier: string; state: string }>(KEY.pkce);
  write(KEY.pkce, null);
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  if (error) return error === 'access_denied' ? 'Spotify sign-in was cancelled.' : `Spotify said: ${error}`;
  if (!pkce || pkce.state !== params.get('state')) return 'Sign-in could not be verified. Please try again.';
  try {
    await tokenRequest({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri(),
      client_id: getClientId(),
      code_verifier: pkce.verifier,
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Sign-in failed.';
  }
}

let refreshing: Promise<Token> | null = null;

export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
  }
}

export async function getAccessToken(force = false): Promise<string> {
  const token = read<Token>(KEY.token);
  if (!token?.refresh_token) throw new SignedOutError();
  if (!force && token.expires_at - Date.now() > 60_000) return token.access_token;
  if (!refreshing) {
    refreshing = tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      client_id: getClientId(),
    })
      .catch((e) => {
        // A dead refresh token means the user has to sign in again.
        write(KEY.token, null);
        window.dispatchEvent(new Event('ms:signedout'));
        throw e;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return (await refreshing).access_token;
}
