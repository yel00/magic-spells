import { useEffect, useState } from 'react';
import { SearchIcon } from '../components/Icons';
import { Card, Shelf, Status } from '../components/Shelf';
import { TrackRow } from '../components/TrackRow';
import { names, year } from '../lib/format';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import { commands } from '../state/player';

let lastQuery = '';

export function Search() {
  const [text, setText] = useState(lastQuery);
  const [query, setQuery] = useState(lastQuery);

  useEffect(() => {
    lastQuery = text;
    const id = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(id);
  }, [text]);

  const r = useData(query ? `search:${query.toLowerCase()}` : null, () => api.search(query));
  const d = r.data;
  const tracks = d?.tracks?.items || [];
  const artists = d?.artists?.items || [];
  const albums = d?.albums?.items || [];
  const playlists = (d?.playlists?.items || []).filter((p): p is NonNullable<typeof p> => !!p);
  const nothing = d && !tracks.length && !artists.length && !albums.length && !playlists.length;

  return (
    <div className="page">
      <header className="page-head"><h1>Search</h1></header>
      <label className="searchbox">
        <SearchIcon size={18} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Artists, albums, songs, playlists"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </label>

      {!query && <p className="status">Search all of Spotify.</p>}
      <Status loading={r.loading} error={r.error} empty={nothing && `Nothing found for “${query}”.`} />

      {artists.length > 0 && (
        <Shelf title="Artists">
          {artists.map((a) => <Card key={a.id} title={a.name} images={a.images} to={`/artist/${a.id}`} round />)}
        </Shelf>
      )}
      {tracks.length > 0 && (
        <section className="shelf">
          <h2>Songs</h2>
          <div className="rows">
            {tracks.map((t) => <TrackRow key={t.id} track={t} onPlay={() => commands.playTracks([t.uri])} />)}
          </div>
        </section>
      )}
      {albums.length > 0 && (
        <Shelf title="Albums">
          {albums.map((a) => <Card key={a.id} title={a.name} subtitle={`${names(a.artists)} · ${year(a.release_date)}`} images={a.images} to={`/album/${a.id}`} />)}
        </Shelf>
      )}
      {playlists.length > 0 && (
        <Shelf title="Playlists">
          {playlists.map((p) => <Card key={p.id} title={p.name} subtitle={p.owner?.display_name || ''} images={p.images} to={`/playlist/${p.id}`} />)}
        </Shelf>
      )}
    </div>
  );
}
