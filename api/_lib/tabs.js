// Pure helpers for the tab search (tested separately from the handler).

export function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const slug = (s) => norm(s).replace(/ /g, '-');

const PARTS = [
  ['Guitar', /guitar/i],
  ['Bass', /bass/i],
  ['Keys', /piano|keyboard|organ|rhodes|clav|harpsichord/i],
  ['Drums', /drum|percussion/i],
];

/** Songsterr search results -> the tabs for this song by this artist, with which instruments each has. */
export function shapeTabs(json, title, artist) {
  const t = norm(title);
  const a = norm(artist);
  return (Array.isArray(json) ? json : [])
    // Exact title and artist only: a near match would send someone to the wrong song's tab.
    .filter((s) => s?.songId && norm(s.artist) === a && norm(s.title) === t)
    .slice(0, 3)
    .map((s) => {
      const names = (s.tracks || []).map((tr) => `${tr.instrument || ''} ${tr.name || ''}`);
      return {
        id: s.songId,
        title: s.title,
        artist: s.artist,
        url: `https://www.songsterr.com/a/wsa/${slug(s.artist)}-${slug(s.title)}-tab-s${s.songId}`,
        parts: PARTS.filter(([, re]) => names.some((n) => re.test(n))).map(([label]) => label),
        chords: !!s.hasChords,
      };
    });
}
