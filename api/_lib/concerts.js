// Pure helpers for the concert lookup (tested separately from the handler).

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Ticketmaster takes locations as geohashes. */
export function geohash(lat, lon, precision = 7) {
  let latRange = [-90, 90];
  let lonRange = [-180, 180];
  let hash = '';
  let bits = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    const range = even ? lonRange : latRange;
    const value = even ? lon : lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      ch = (ch << 1) | 1;
      range[0] = mid;
    } else {
      ch <<= 1;
      range[1] = mid;
    }
    even = !even;
    if (++bits === 5) {
      hash += BASE32[ch];
      bits = 0;
      ch = 0;
    }
  }
  return hash;
}

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Reduce Ticketmaster's response to the shows where this artist is actually on
 * the bill. A keyword search also returns tribute acts and unrelated events
 * that merely mention the name, so the artist must appear among the performers.
 */
export function shapeEvents(json, artist) {
  const want = norm(artist);
  const out = [];
  for (const e of json?._embedded?.events || []) {
    const lineup = (e._embedded?.attractions || []).map((a) => a.name).filter(Boolean);
    if (!lineup.some((n) => norm(n) === want)) continue;
    const status = e.dates?.status?.code;
    if (status === 'cancelled') continue;
    const date = e.dates?.start?.localDate;
    if (!date) continue;
    const venue = e._embedded?.venues?.[0];
    const images = (e.images || []).filter((i) => i.ratio === '16_9').sort((a, b) => a.width - b.width);
    out.push({
      id: e.id,
      name: e.name,
      date,
      time: e.dates.start.noSpecificTime ? undefined : e.dates.start.localTime?.slice(0, 5),
      venue: venue?.name || '',
      city: [venue?.city?.name, venue?.state?.stateCode || venue?.country?.countryCode].filter(Boolean).join(', '),
      url: e.url,
      lineup,
      image: (images.find((i) => i.width >= 600) || images[images.length - 1])?.url,
      status: status === 'postponed' || status === 'rescheduled' ? status : undefined,
      distance: typeof e.distance === 'number' ? Math.round(e.distance) : undefined,
    });
  }
  return out;
}
