// Demo mode: an invented library and a simulated player, so the app can be
// explored (and tested) without a Spotify account. Nothing here is real music.
import { ApiError } from './api';
import type { Album, AlbumRef, Artist, Device, Playlist, Track } from './types';

const PALETTE = [
  ['#3b2a6b', '#c9b6ff'], ['#0f4c5c', '#9ad1d4'], ['#6b2a3b', '#ffb4a2'], ['#2a4b6b', '#a2d2ff'],
  ['#4b3b1a', '#ffd98a'], ['#1f4b33', '#b7e4c7'], ['#4a2a5c', '#f1c0e8'], ['#5c3a1f', '#f4a261'],
];

function cover(label: string, n: number, round = false): string {
  const [a, b] = PALETTE[n % PALETTE.length];
  const initials = label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const shape = round
    ? `<circle cx="150" cy="150" r="150" fill="url(#g)"/>`
    : `<rect width="300" height="300" fill="url(#g)"/><circle cx="${60 + ((n * 47) % 180)}" cy="${70 + ((n * 83) % 160)}" r="${50 + ((n * 29) % 60)}" fill="${b}" opacity=".18"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#15151a"/></linearGradient></defs>${shape}<text x="150" y="172" font-family="Georgia,serif" font-size="72" fill="${b}" text-anchor="middle">${initials}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

const ARTIST_NAMES = ['Paper Lanterns', 'The Slow Tide', 'Marlowe Finch', 'Glass Orchard', 'Juniper Vale', 'Night Ferry', 'Odessa Park', 'Low Sun Radio'];
const GENRES = [['indie folk'], ['dream pop', 'shoegaze'], ['singer-songwriter'], ['ambient', 'modern classical'], ['alt country'], ['synthwave'], ['soul', 'r&b'], ['psych rock']];
const ALBUM_WORDS = ['Harbor Lights', 'Small Hours', 'Field Notes', 'Winter Garden', 'Long Way Round', 'Afterglow', 'Quiet Machines', 'Borrowed Time', 'Salt & Cedar', 'Northbound', 'Paper Moon', 'Second Sight', 'Low Tide', 'Open Windows', 'Static Bloom', 'Evening Standard'];
const TRACK_WORDS = ['Lanterns', 'Driftwood', 'Halfway Home', 'Blue Hour', 'Signal Fire', 'Marigold', 'Slow Burn', 'Tidewater', 'Paper Planes at Dusk', 'Hollow Pine', 'Afterimage', 'Golden Mile', 'Undertow', 'Letters Unsent', 'Morning Static', 'Cedar Smoke', 'Northern Line', 'Soft Landing', 'Wildflower Radio', 'Last Light'];

const artists: Artist[] = ARTIST_NAMES.map((name, i) => ({
  id: `ar${i}`, name, uri: `spotify:artist:ar${i}`, genres: GENRES[i], images: [{ url: cover(name, i, true) }],
}));

const albums: Album[] = [];
const tracks: Track[] = [];
ALBUM_WORDS.forEach((name, i) => {
  const artist = artists[i % artists.length];
  const ref: AlbumRef = {
    id: `al${i}`, name, uri: `spotify:album:al${i}`, images: [{ url: cover(name, i + 3) }],
    artists: [{ id: artist.id, name: artist.name, uri: artist.uri }],
    release_date: `${2008 + ((i * 5) % 17)}-0${1 + (i % 9)}-12`, album_type: i % 5 === 4 ? 'single' : 'album',
    total_tracks: i % 5 === 4 ? 3 : 9,
  };
  const list: Track[] = [];
  for (let t = 0; t < ref.total_tracks!; t++) {
    const track: Track = {
      id: `tr${i}_${t}`, uri: `spotify:track:tr${i}_${t}`, name: TRACK_WORDS[(i * 3 + t * 7) % TRACK_WORDS.length],
      duration_ms: 150_000 + ((i * 37 + t * 53) % 180) * 1000, track_number: t + 1, disc_number: 1,
      artists: ref.artists, album: ref, explicit: (i + t) % 11 === 0, type: 'track',
    };
    list.push(track);
    tracks.push(track);
  }
  albums.push({ ...ref, tracks: { items: list, next: null, total: list.length }, copyrights: [{ text: '℗ Demo recordings — not real music' }] });
});

const PLAYLIST_NAMES = ['Sunday Morning Slow', 'Deep Focus Desk', 'Road Trip North', 'Late Night Kitchen', 'New Finds'];
const playlists: (Playlist & { list: Track[] })[] = PLAYLIST_NAMES.map((name, i) => {
  const list = tracks.filter((_, n) => (n * (i + 3)) % 9 === 0).slice(0, 24);
  return {
    id: `pl${i}`, name, uri: `spotify:playlist:pl${i}`, description: i === 4 ? 'Things worth a second listen.' : '',
    images: [{ url: cover(name, i + 5) }], owner: { id: i === 2 ? 'friend' : 'demo', display_name: i === 2 ? 'A Friend' : 'Demo Listener' },
    list,
  };
});

const devices: Device[] = [
  { id: 'd1', name: 'Living Room', type: 'Speaker', is_active: true, volume_percent: 42, supports_volume: true },
  { id: 'd2', name: 'Kitchen', type: 'Speaker', is_active: false, volume_percent: 30, supports_volume: true },
  { id: 'd3', name: 'Downstairs (group)', type: 'Speaker', is_active: false, volume_percent: 35, supports_volume: true },
  { id: 'd4', name: 'Office Receiver', type: 'AVR', is_active: false, volume_percent: 50, supports_volume: true },
  { id: 'd5', name: 'This iPhone', type: 'Smartphone', is_active: false, volume_percent: 100, supports_volume: false },
];

const saved = new Set<string>([albums[0].uri, albums[2].uri, albums[5].uri, albums[7].uri, albums[9].uri, artists[0].uri, artists[3].uri, artists[5].uri, ...tracks.filter((_, i) => i % 6 === 0).map((t) => t.uri)]);

const player = {
  list: albums[1].tracks.items.slice(),
  index: 2,
  playing: true,
  startedAt: Date.now() - 47_000,
  pausedAt: 47_000,
  shuffle: false,
  repeat: 'off' as 'off' | 'track' | 'context',
  context: { uri: albums[1].uri, type: 'album' } as { uri: string; type: string } | null,
  extra: [] as Track[],
};

function progress(): number {
  return player.playing ? Date.now() - player.startedAt : player.pausedAt;
}

function setProgress(ms: number) {
  player.pausedAt = ms;
  player.startedAt = Date.now() - ms;
}

function advance(step: number) {
  if (step > 0 && player.extra.length) {
    player.list.splice(player.index + 1, 0, player.extra.shift()!);
  }
  player.index = (player.index + step + player.list.length) % player.list.length;
  setProgress(0);
}

function tick() {
  let cur = player.list[player.index];
  while (player.playing && cur && progress() >= cur.duration_ms) {
    const over = progress() - cur.duration_ms;
    advance(1);
    setProgress(over);
    cur = player.list[player.index];
  }
}

function page<T>(items: T[]) {
  return { items, next: null, total: items.length };
}

function contextTracks(uri: string): Track[] {
  const [, type, id] = uri.split(':');
  if (type === 'album') return albums.find((a) => a.id === id)?.tracks.items || [];
  if (type === 'playlist') return playlists.find((p) => p.id === id)?.list || [];
  if (type === 'artist') return tracks.filter((t) => t.artists[0].id === id).slice(0, 10);
  return [];
}

function publicPlaylist(p: (typeof playlists)[number]): Playlist {
  const { list, ...rest } = p;
  const owned = p.owner.id === 'demo';
  return { ...rest, items: owned ? { ...page(list.map((item) => ({ item }))) } : { total: list.length } };
}

export async function demoRequest(method: string, url: URL, body: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 60));
  const path = url.pathname.replace(/^\/v1/, '');
  const q = url.searchParams;
  const seg = path.split('/').filter(Boolean);
  const active = () => devices.find((d) => d.is_active);
  tick();

  if (path === '/me') return { id: 'demo', display_name: 'Demo Listener' };

  if (path === '/me/player' && method === 'GET') {
    const device = active();
    if (!device) return null;
    return {
      device, is_playing: player.playing, progress_ms: progress(), item: player.list[player.index],
      shuffle_state: player.shuffle, repeat_state: player.repeat, context: player.context,
    };
  }
  if (path === '/me/player' && method === 'PUT') {
    devices.forEach((d) => (d.is_active = d.id === body.device_ids[0]));
    if (body.play) { player.startedAt = Date.now() - player.pausedAt; player.playing = true; }
    return null;
  }
  if (path === '/me/player/devices') return { devices };
  if (path === '/me/player/play') {
    const id = q.get('device_id');
    if (id) devices.forEach((d) => (d.is_active = d.id === id));
    if (!active()) throw new ApiError(404, 'No active device', 'NO_ACTIVE_DEVICE');
    if (body?.context_uri) {
      player.list = contextTracks(body.context_uri).slice();
      player.context = { uri: body.context_uri, type: body.context_uri.split(':')[1] };
      player.index = body.offset?.uri ? Math.max(0, player.list.findIndex((t) => t.uri === body.offset.uri)) : body.offset?.position || 0;
      setProgress(0);
    } else if (body?.uris) {
      player.list = body.uris.map((u: string) => tracks.find((t) => t.uri === u)).filter(Boolean);
      player.context = null;
      player.index = body.offset?.position || 0;
      setProgress(0);
    } else {
      player.startedAt = Date.now() - player.pausedAt;
    }
    player.playing = true;
    return null;
  }
  if (path === '/me/player/pause') { player.pausedAt = progress(); player.playing = false; return null; }
  if (path === '/me/player/next') { advance(1); return null; }
  if (path === '/me/player/previous') { if (progress() > 3000) setProgress(0); else advance(-1); return null; }
  if (path === '/me/player/seek') { setProgress(Number(q.get('position_ms'))); return null; }
  if (path === '/me/player/volume') { const d = active(); if (d) d.volume_percent = Number(q.get('volume_percent')); return null; }
  if (path === '/me/player/shuffle') { player.shuffle = q.get('state') === 'true'; return null; }
  if (path === '/me/player/repeat') { player.repeat = q.get('state') as typeof player.repeat; return null; }
  if (path === '/me/player/queue' && method === 'GET') {
    return { currently_playing: player.list[player.index], queue: [...player.extra, ...player.list.slice(player.index + 1)].slice(0, 20) };
  }
  if (path === '/me/player/queue' && method === 'POST') {
    const t = tracks.find((x) => x.uri === q.get('uri'));
    if (t) player.extra.push(t);
    return null;
  }
  if (path === '/me/player/recently-played') {
    const ctx = [albums[1], albums[4], playlists[0], albums[8], playlists[3], albums[11], albums[6]];
    return page(ctx.map((c, i) => ({
      track: contextTracks(c.uri)[0], played_at: new Date(Date.now() - i * 3_600_000).toISOString(),
      context: { uri: c.uri, type: c.uri.split(':')[1] },
    })));
  }

  if (path === '/me/playlists' && method === 'GET') return page(playlists.map(publicPlaylist));
  if (path === '/me/playlists' && method === 'POST') {
    const id = `pl${playlists.length}`;
    const p = { id, name: body.name, uri: `spotify:playlist:${id}`, description: body.description, images: [{ url: cover(body.name, playlists.length + 5) }], owner: { id: 'demo', display_name: 'Demo Listener' }, list: [] as Track[] };
    playlists.unshift(p);
    return publicPlaylist(p);
  }
  if (path === '/me/albums') return page(albums.filter((a) => saved.has(a.uri)).map((album) => ({ album })));
  if (path === '/me/tracks') return page(tracks.filter((t) => saved.has(t.uri)).map((track) => ({ track })));
  if (path === '/me/following') return { artists: page(artists.filter((a) => saved.has(a.uri))) };
  if (path === '/me/top/artists') return page(artists.slice(0, 6));
  if (path === '/me/top/tracks') return page(tracks.filter((_, i) => i % 13 === 1).slice(0, 10));
  if (path === '/me/library/contains') return (q.get('uris') || '').split(',').map((u) => saved.has(u));
  if (path === '/me/library') {
    (body.uris as string[]).forEach((u) => (method === 'PUT' ? saved.add(u) : saved.delete(u)));
    return null;
  }

  if (seg[0] === 'albums') return albums.find((a) => a.id === seg[1]) ?? notFound();
  if (seg[0] === 'artists' && seg[2] === 'albums') return page(albums.filter((a) => a.artists[0].id === seg[1]).map(({ tracks: _t, ...ref }) => ref));
  if (seg[0] === 'artists') return artists.find((a) => a.id === seg[1]) ?? notFound();
  if (seg[0] === 'playlists' && seg[2] === 'items' && method === 'POST') {
    const p = playlists.find((x) => x.id === seg[1]);
    (body.uris as string[]).forEach((u) => { const t = tracks.find((x) => x.uri === u); if (p && t) p.list.push(t); });
    return { snapshot_id: 'demo' };
  }
  if (seg[0] === 'playlists' && seg[2] === 'items') {
    const p = playlists.find((x) => x.id === seg[1]);
    if (!p || p.owner.id !== 'demo') throw new ApiError(403, 'Forbidden');
    return page(p.list.map((item) => ({ item })));
  }
  if (seg[0] === 'playlists') { const p = playlists.find((x) => x.id === seg[1]); return p ? publicPlaylist(p) : notFound(); }

  if (path === '/search') {
    // Understand the artist:"…" filter the discovery code uses.
    const term = (q.get('q') || '').replace(/^artist:"(.*)"$/, '$1').toLowerCase();
    const has = (s: string) => s.toLowerCase().includes(term);
    return {
      tracks: page(tracks.filter((t) => has(t.name) || has(t.artists[0].name)).slice(0, 10)),
      artists: page(artists.filter((a) => has(a.name)).slice(0, 10)),
      albums: page(albums.filter((a) => has(a.name) || has(a.artists[0].name)).map(({ tracks: _t, ...ref }) => ref).slice(0, 10)),
      playlists: page(playlists.filter((p) => has(p.name)).map(publicPlaylist).slice(0, 10)),
    };
  }
  return notFound();
}

function notFound(): never {
  throw new ApiError(404, 'Not found');
}
