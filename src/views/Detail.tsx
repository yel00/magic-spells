import { useEffect, useState, type ReactNode } from 'react';
import { AboutSkeleton, AboutText, Chips, Credits, Facts, Links } from '../components/About';
import { Art } from '../components/Art';
import { ChevronLeft, HeartIcon, PlayIcon, ShuffleIcon } from '../components/Icons';
import { Card, Shelf, Status } from '../components/Shelf';
import { TrackRow } from '../components/TrackRow';
import { albumInfo, artistInfo } from '../enrich';
import { formatDuration, names, year } from '../lib/format';
import { go } from '../lib/router';
import { invalidate, useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { Image } from '../spotify/types';
import { commands } from '../state/player';
import { toast } from '../state/ui';

function Back() {
  return (
    <button className="icon-btn back" onClick={() => (window.history.length > 1 ? window.history.back() : go('/home'))} aria-label="Back">
      <ChevronLeft />
    </button>
  );
}

/** Save / follow toggle for anything with a Spotify URI. */
function SaveButton({ uri, cacheKey, labels }: { uri: string; cacheKey: string; labels: [string, string] }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    setSaved(null);
    api.libraryContains([uri]).then((r) => live && setSaved(!!r[0]));
    return () => {
      live = false;
    };
  }, [uri]);
  const toggle = async () => {
    const want = !saved;
    setSaved(want);
    try {
      await (want ? api.saveToLibrary([uri]) : api.removeFromLibrary([uri]));
      invalidate(cacheKey);
    } catch {
      setSaved(!want);
      toast('Couldn’t update your library.');
    }
  };
  return (
    <button className={`icon-btn ${saved ? 'on' : ''}`} onClick={toggle} disabled={saved === null} aria-pressed={!!saved} aria-label={saved ? labels[1] : labels[0]}>
      <HeartIcon filled={!!saved} />
    </button>
  );
}

function Hero({
  images, round, kicker, title, lines, uri, children,
}: {
  images: Image[] | null | undefined;
  round?: boolean;
  kicker: string;
  title: string;
  lines: ReactNode[];
  uri: string;
  children?: ReactNode;
}) {
  return (
    <header className="hero">
      <Back />
      <Art images={images} size={240} round={round} className="hero-art" />
      <div className="hero-text">
        <span className="kicker">{kicker}</span>
        <h1>{title}</h1>
        {lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={() => commands.playContext(uri)}><PlayIcon size={18} /> Play</button>
          <button className="btn" onClick={() => commands.shuffleContext(uri)}><ShuffleIcon size={18} /> Shuffle</button>
          {children}
        </div>
      </div>
    </header>
  );
}

export function AlbumView({ id }: { id: string }) {
  const { data: a, loading, error } = useData(`album:${id}`, () => api.album(id));
  const info = useData(a ? `info:album:${id}` : null, () =>
    albumInfo({ name: a!.name, artist: a!.artists[0]?.name || '', upc: a!.external_ids?.upc }).then((v) => v ?? false),
  );
  if (!a) return <div className="page"><Back /><Status loading={loading} error={error} /></div>;
  const tracks = a.tracks.items;
  const total = tracks.reduce((n, t) => n + t.duration_ms, 0);
  const discs = new Set(tracks.map((t) => t.disc_number || 1)).size;
  return (
    <div className="page">
      <Hero
        images={a.images}
        kicker={a.album_type === 'single' ? 'Single' : a.album_type === 'compilation' ? 'Compilation' : 'Album'}
        title={a.name}
        uri={a.uri}
        lines={[
          <button className="link" onClick={() => go(`/artist/${a.artists[0].id}`)}>{names(a.artists)}</button>,
          `${year(a.release_date)} · ${tracks.length} tracks · ${formatDuration(total)}`,
        ]}
      >
        <SaveButton uri={a.uri} cacheKey="library:albums" labels={['Save album', 'Remove album']} />
      </Hero>
      <div className="rows">
        {tracks.map((t, i) => (
          <div key={t.id}>
            {discs > 1 && (i === 0 || tracks[i - 1].disc_number !== t.disc_number) && <h3 className="disc">Disc {t.disc_number}</h3>}
            <TrackRow
              track={{ ...t, album: a }}
              number={t.track_number}
              showArt={false}
              showArtist={names(t.artists) !== names(a.artists)}
              onPlay={() => commands.playContext(a.uri, t.uri)}
            />
          </div>
        ))}
      </div>
      {info.loading && <section className="about"><AboutSkeleton /></section>}
      {info.data && (
        <section className="about">
          <h2>About this album</h2>
          {info.data.about && <AboutText summary={info.data.about} />}
          <Facts items={info.data.facts} />
          {info.data.credits.length > 0 && <h2 className="credits-head">Credits</h2>}
          <Credits groups={info.data.credits} />
          <Links links={info.data.links} />
        </section>
      )}
      {a.copyrights?.[0] && <p className="fineprint">{a.copyrights[0].text}</p>}
    </div>
  );
}

export function ArtistView({ id }: { id: string }) {
  const { data: a, loading, error } = useData(`artist:${id}`, () => api.artist(id));
  const disc = useData(`artist:${id}:albums`, () => api.artistAlbums(id));
  const info = useData(a ? `info:artist:${id}` : null, () => artistInfo(a!.name).then((v) => v ?? false));
  if (!a) return <div className="page"><Back /><Status loading={loading} error={error} /></div>;
  const all = disc.data?.items || [];
  const albums = all.filter((x) => x.album_type === 'album');
  const singles = all.filter((x) => x.album_type !== 'album');
  return (
    <div className="page">
      <Hero images={a.images} round kicker="Artist" title={a.name} uri={a.uri} lines={[(a.genres?.length ? a.genres : info.data ? info.data.genres : []).slice(0, 3).join(' · ')]}>
        <SaveButton uri={a.uri} cacheKey="library:artists" labels={['Follow', 'Unfollow']} />
      </Hero>
      {info.loading && <section className="about"><AboutSkeleton /></section>}
      {info.data && (
        <section className="about">
          {info.data.bio && <AboutText summary={info.data.bio} />}
          <Facts items={info.data.facts} />
          {!a.genres?.length && <Chips items={info.data.genres} />}
          <Links links={info.data.links} />
        </section>
      )}
      <Status loading={disc.loading} error={disc.error} />
      {albums.length > 0 && (
        <Shelf title="Albums">
          {albums.map((x) => <Card key={x.id} title={x.name} subtitle={year(x.release_date)} images={x.images} to={`/album/${x.id}`} />)}
        </Shelf>
      )}
      {singles.length > 0 && (
        <Shelf title="Singles & EPs">
          {singles.map((x) => <Card key={x.id} title={x.name} subtitle={year(x.release_date)} images={x.images} to={`/album/${x.id}`} />)}
        </Shelf>
      )}
    </div>
  );
}

export function PlaylistView({ id }: { id: string }) {
  const { data: p, loading, error } = useData(`playlist:${id}`, () => api.playlist(id));
  // Spotify only shares track lists for playlists the user owns or collaborates on.
  const items = useData(p ? `playlist:${id}:items` : null, () => api.playlistItems(id).catch(() => null));
  if (!p) return <div className="page"><Back /><Status loading={loading} error={error} /></div>;
  const entries = items.data?.items ?? p.items?.items ?? p.tracks?.items ?? [];
  const tracks = entries.map(api.entryTrack).filter((t): t is NonNullable<typeof t> => !!t && !!t.uri);
  const count = api.playlistCount(p);
  const hidden = !items.loading && tracks.length === 0 && (count ?? 0) > 0;
  return (
    <div className="page">
      <Hero
        images={p.images}
        kicker="Playlist"
        title={p.name}
        uri={p.uri}
        lines={[p.description ? stripTags(p.description) : null, [p.owner.display_name, count !== undefined && `${count} tracks`].filter(Boolean).join(' · ')]}
      />
      <Status loading={items.loading} />
      {hidden && (
        <p className="status">
          Spotify only shares the track list for playlists you own. You can still play this one — the queue shows what’s coming up.
        </p>
      )}
      <div className="rows">
        {tracks.map((t, i) => <TrackRow key={`${t.uri}-${i}`} track={t} onPlay={() => commands.playContext(p.uri, t.uri)} />)}
      </div>
    </div>
  );
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
