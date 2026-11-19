import { useEffect, useState } from 'react';
import { Art, pickImage } from '../components/Art';
import { SearchIcon } from '../components/Icons';
import { Card, Shelf, Status } from '../components/Shelf';
import { TrackRow } from '../components/TrackRow';
import { clearHistory, forget, history, rememberOpened, rememberSearch, type HistoryEntry } from '../history/store';
import { names, uniqueBy, year } from '../lib/format';
import { go, pathForUri } from '../lib/router';
import { useStore } from '../lib/store';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { Image } from '../spotify/types';
import { commands } from '../state/player';

let lastQuery = '';

/** "Today", "Yesterday", a weekday within the week, otherwise a short date. */
export function whenLabel(at: number, now = Date.now()): string {
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(at).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const KIND: Record<string, string> = { artist: 'Artist', album: 'Album', track: 'Song', playlist: 'Playlist' };

/** What fills the page before a search is typed. */
function StartScreen({ onSearch }: { onSearch: (q: string) => void }) {
  const { searches, opened } = useStore(history);
  const recent = useData('home:recent', api.recentlyPlayed);
  const played = uniqueBy((recent.data?.items || []).map((h) => h.track), (t) => t.id).slice(0, 14);

  const open = (e: HistoryEntry) => {
    const type = e.uri!.split(':')[1];
    rememberOpened({ uri: e.uri!, title: e.title, sub: e.sub || '', image: e.image });
    if (type === 'track') commands.playTracks([e.uri!]);
    else {
      const path = pathForUri(e.uri);
      if (path) go(path);
    }
  };

  if (!searches.length && !opened.length && !played.length) return <p className="status">Search all of Spotify.</p>;
  return (
    <>
      {searches.length > 0 && (
        <section className="start-block">
          <div className="start-head"><h2>Recent searches</h2><button onClick={() => clearHistory('search')}>Clear</button></div>
          <div className="start-chips">
            {searches.slice(0, 10).map((s) => (
              <span key={s.key} className="start-chip">
                <button className="start-word" onClick={() => onSearch(s.title)}>{s.title}</button>
                <button className="start-drop" onClick={() => forget(s)} aria-label={`Forget “${s.title}”`}>✕</button>
              </span>
            ))}
          </div>
        </section>
      )}
      {opened.length > 0 && (
        <section className="start-block">
          <div className="start-head"><h2>Recently opened</h2><button onClick={() => clearHistory('item')}>Clear</button></div>
          <div className="start-rows">
            {opened.slice(0, 6).map((e) => {
              const type = e.uri!.split(':')[1];
              return (
                <button key={e.key} className="start-row" onClick={() => open(e)}>
                  <Art images={e.image ? [{ url: e.image }] : null} size={44} round={type === 'artist'} />
                  <span className="row-text">
                    <span className="row-title">{e.title}</span>
                    <span className="row-sub">{[KIND[type], e.sub].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="start-when">{whenLabel(e.at)}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {played.length > 0 && (
        <Shelf title="Recently played">
          {played.map((t) => (
            <button key={t.id} className="card start-played" onClick={() => commands.playTracks([t.uri])}>
              <Art images={t.album?.images} size={110} />
              <span className="card-title">{t.name}</span>
              <span className="card-sub">{names(t.artists)}</span>
            </button>
          ))}
        </Shelf>
      )}
    </>
  );
}

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

  // Opening a result is what makes a search worth remembering, along with the thing opened.
  const opened = (uri: string, title: string, sub: string, images?: Image[] | null) => {
    rememberSearch(query);
    rememberOpened({ uri, title, sub, image: pickImage(images, 44) || null });
  };

  return (
    <div className="page">
      <header className="page-head"><h1>Search</h1></header>
      <label className="searchbox">
        <SearchIcon size={18} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              rememberSearch(text);
              e.currentTarget.blur();
            }
          }}
          placeholder="Artists, albums, songs, playlists"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </label>

      {!query && !text.trim() && <StartScreen onSearch={(q) => { setText(q); setQuery(q); rememberSearch(q); }} />}
      <Status loading={r.loading} error={r.error} empty={nothing && `Nothing found for “${query}”.`} />

      {artists.length > 0 && (
        <Shelf title="Artists">
          {artists.map((a) => <Card key={a.id} title={a.name} images={a.images} to={`/artist/${a.id}`} round onOpen={() => opened(a.uri, a.name, '', a.images)} />)}
        </Shelf>
      )}
      {tracks.length > 0 && (
        <section className="shelf">
          <h2>Songs</h2>
          <div className="rows">
            {tracks.map((t) => <TrackRow key={t.id} track={t} onPlay={() => { opened(t.uri, t.name, names(t.artists), t.album?.images); commands.playTracks([t.uri]); }} />)}
          </div>
        </section>
      )}
      {albums.length > 0 && (
        <Shelf title="Albums">
          {albums.map((a) => <Card key={a.id} title={a.name} subtitle={`${names(a.artists)} · ${year(a.release_date)}`} images={a.images} to={`/album/${a.id}`} onOpen={() => opened(a.uri, a.name, names(a.artists), a.images)} />)}
        </Shelf>
      )}
      {playlists.length > 0 && (
        <Shelf title="Playlists">
          {playlists.map((p) => <Card key={p.id} title={p.name} subtitle={p.owner?.display_name || ''} images={p.images} to={`/playlist/${p.id}`} onOpen={() => opened(p.uri, p.name, p.owner?.display_name || '', p.images)} />)}
        </Shelf>
      )}
    </div>
  );
}
