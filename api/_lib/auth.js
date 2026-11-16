// Who is calling? The app sends the Spotify access token it already holds; we
// ask Spotify whose it is. No separate login, no passwords.
const known = new Map(); // token -> { id, until }

export async function spotifyUser(token) {
  const hit = known.get(token);
  if (hit && hit.until > Date.now()) return hit.id;
  const r = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`Spotify ${r.status}`);
  const { id } = await r.json();
  if (!id) return null;
  if (known.size > 500) known.clear();
  known.set(token, { id, until: Date.now() + 5 * 60_000 });
  return id;
}

export const bearer = (req) => /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1] || null;
