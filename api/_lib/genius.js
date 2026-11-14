// Pure helpers for the Genius lookup, kept apart from the request handler so they can be tested.

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Choose the search hit that is really this song by this artist, or null. A wrong match is worse than none. */
export function pickHit(hits, title, artist) {
  const t = norm(title);
  const a = norm(artist);
  for (const h of hits || []) {
    const song = h?.result;
    if (!song || h.type !== 'song') continue;
    const st = norm(song.title);
    const sa = norm(song.primary_artist?.name);
    const titleOk = st === t || st.startsWith(t + ' ') || t.startsWith(st + ' ');
    const artistOk = sa === a || sa.includes(a) || a.includes(sa) || norm(song.artist_names).includes(a);
    if (titleOk && artistOk && sa) return song;
  }
  return null;
}

const RELATION_LABELS = {
  samples: 'Samples',
  sampled_in: 'Sampled in',
  interpolates: 'Interpolates',
  interpolated_by: 'Interpolated by',
  cover_of: 'Cover of',
  covered_by: 'Covered by',
  remix_of: 'Remix of',
  remixed_by: 'Remixed by',
  live_version_of: 'Live version of',
  performed_live_as: 'Performed live as',
};

/** Reduce Genius's large song object to the handful of fields the app shows. */
export function shapeSong(song) {
  const text = song.description?.plain;
  const related = (song.song_relationships || [])
    .filter((r) => RELATION_LABELS[r.relationship_type] && r.songs?.length)
    .map((r) => ({
      label: RELATION_LABELS[r.relationship_type],
      songs: r.songs.slice(0, 6).map((s) => ({ title: s.title, artist: s.primary_artist?.name || s.artist_names || '', url: s.url })),
    }));
  return {
    url: song.url,
    title: song.title,
    artist: song.primary_artist?.name || song.artist_names || '',
    description: text && text.trim() !== '?' ? text.trim() : undefined,
    released: song.release_date_for_display || undefined,
    writers: (song.writer_artists || []).map((x) => x.name),
    producers: (song.producer_artists || []).map((x) => x.name),
    related,
  };
}
