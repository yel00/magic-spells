import { Card, Shelf, Status } from '../components/Shelf';
import { NewsShelves } from '../components/News';
import { GearIcon, ToolsIcon } from '../components/Icons';
import { TrackRow } from '../components/TrackRow';
import { greeting, names, uniqueBy } from '../lib/format';
import { go, pathForUri } from '../lib/router';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import { commands } from '../state/player';

export function Home() {
  const recent = useData('home:recent', api.recentlyPlayed);
  const artists = useData('home:topArtists', api.topArtists);
  const tracks = useData('home:topTracks', api.topTracks);
  const playlists = useData('library:playlists', api.myPlaylists);

  // "Jump back in": one tile per album, however many of its tracks were played.
  const albums = uniqueBy(
    (recent.data?.items || []).map((h) => h.track.album).filter((a): a is NonNullable<typeof a> => !!a),
    (a) => a.id,
  ).slice(0, 12);
  const top = tracks.data?.items || [];

  return (
    <div className="page">
      <header className="page-head">
        <h1>{greeting(new Date().getHours())}</h1>
        <span className="head-actions">
          <button className="icon-btn" onClick={() => go('/tools')} aria-label="Musician tools"><ToolsIcon /></button>
          <button className="icon-btn" onClick={() => go('/settings')} aria-label="Settings"><GearIcon /></button>
        </span>
      </header>

      <NewsShelves />

      <Status loading={recent.loading && artists.loading} error={recent.error && artists.error} />

      {albums.length > 0 && (
        <Shelf title="Jump back in">
          {albums.map((a) => <Card key={a.id} title={a.name} subtitle={names(a.artists)} images={a.images} to={pathForUri(a.uri)!} />)}
        </Shelf>
      )}

      {!!artists.data?.items.length && (
        <Shelf title="Your top artists">
          {artists.data.items.map((a) => <Card key={a.id} title={a.name} images={a.images} to={`/artist/${a.id}`} round />)}
        </Shelf>
      )}

      {top.length > 0 && (
        <section className="shelf">
          <h2>On repeat lately</h2>
          <div className="rows">
            {top.slice(0, 8).map((t, i) => (
              <TrackRow key={t.id} track={t} onPlay={() => commands.playTracks(top.map((x) => x.uri), i)} />
            ))}
          </div>
        </section>
      )}

      {!!playlists.data?.items.length && (
        <Shelf title="Your playlists">
          {playlists.data.items.filter(Boolean).slice(0, 12).map((p) => (
            <Card key={p.id} title={p.name} subtitle={p.owner.display_name || ''} images={p.images} to={`/playlist/${p.id}`} />
          ))}
        </Shelf>
      )}
    </div>
  );
}
