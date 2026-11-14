// Pure shaping helpers for the discovery and video lookups (tested separately from the handlers).

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

/** YouTube returns titles HTML-escaped. */
export function decodeEntities(s) {
  return String(s || '')
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Last.fm artist.getSimilar -> [{ name, mbid }] */
export function shapeLastfmSimilar(json, limit = 20) {
  const list = json?.similarartists?.artist;
  const arr = Array.isArray(list) ? list : list ? [list] : [];
  return arr
    .filter((a) => a?.name && Number(a.match) > 0.05)
    .slice(0, limit)
    .map((a) => ({ name: a.name, mbid: a.mbid || undefined }));
}

/** YouTube search.list -> [{ id, title, channel, thumb }] */
export function shapeYoutube(json) {
  return (json?.items || [])
    .filter((i) => i?.id?.videoId && i.snippet)
    .map((i) => ({
      id: i.id.videoId,
      title: decodeEntities(i.snippet.title),
      channel: decodeEntities(i.snippet.channelTitle),
      thumb: i.snippet.thumbnails?.medium?.url || i.snippet.thumbnails?.default?.url || '',
    }));
}
