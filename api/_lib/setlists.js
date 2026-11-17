// Shapes setlist.fm's answers into what the app shows: who played, where and
// when, and what they played. Kept free of network code so it can be tested.

/** setlist.fm writes dates as day-month-year ("23-08-1964"); the app sorts on year-month-day. */
export function isoDate(eventDate) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(eventDate || ''));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

export function shapeShow(raw) {
  if (!raw || !raw.id || !raw.artist?.name) return null;
  // The sets arrive as sets.set[]; the documentation also describes a bare set[], so both are read.
  const sets = ((raw.sets && raw.sets.set) || (Array.isArray(raw.set) ? raw.set : []))
    .map((s) => ({
      name: text(s.name) || (s.encore ? (s.encore > 1 ? `Encore ${s.encore}` : 'Encore') : ''),
      songs: (s.song || [])
        .filter((x) => text(x.name))
        .map((x) => ({
          name: text(x.name),
          ...(text(x.info) && { info: text(x.info) }),
          ...(x.cover?.name && { cover: text(x.cover.name) }),
          ...(x.with?.name && { guest: text(x.with.name) }),
          ...(x.tape && { tape: true }),
        })),
    }))
    .filter((s) => s.songs.length);
  const city = raw.venue?.city || {};
  return {
    id: String(raw.id),
    date: isoDate(raw.eventDate),
    artist: { name: text(raw.artist.name), mbid: text(raw.artist.mbid) },
    venue: text(raw.venue?.name),
    city: text(city.name),
    region: text(city.stateCode) || text(city.state),
    country: text(city.country?.name),
    tour: text(raw.tour?.name),
    info: text(raw.info),
    url: text(raw.url),
    songCount: sets.reduce((n, s) => n + s.songs.length, 0),
    sets,
  };
}

export function shapeList(json) {
  const shows = ((json && json.setlist) || []).map(shapeShow).filter(Boolean);
  return {
    // A list doesn't need every song: the show's own page fetches them.
    shows: shows.map(({ sets, ...rest }) => rest),
    page: Number(json?.page) || 1,
    perPage: Number(json?.itemsPerPage) || 20,
    total: Number(json?.total) || shows.length,
  };
}

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOW_ID = /^[0-9a-f]{6,16}$/i;

/** Reads and checks what the browser asked for. Null means the request makes no sense. */
export function readQuery(q) {
  const id = String(q.id || '');
  if (id) return SHOW_ID.test(id) ? { kind: 'show', id: id.toLowerCase() } : null;
  const mbid = String(q.mbid || '');
  if (!MBID.test(mbid)) return null;
  const page = Math.min(Math.max(parseInt(q.p, 10) || 1, 1), 200);
  const year = /^(19|20)\d{2}$/.test(String(q.year || '')) ? String(q.year) : '';
  return { kind: 'list', mbid: mbid.toLowerCase(), page, year };
}
