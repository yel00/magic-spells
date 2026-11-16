import { useEffect, useState, type ReactNode } from 'react';
import { AboutSkeleton, AboutText, Chips, Credits, Facts, Links, Reception, RelatedChips } from '../components/About';
import { demoReception, receptionFor } from '../enrich/reception';
import { isDemo } from '../spotify/auth';
import { ConcertCard } from '../components/Concerts';
import { concerts, showsNear } from '../concerts/store';
import { useStore } from '../lib/store';
import { Art, pickImage } from '../components/Art';
import { ChevronLeft, HeartIcon, PlayIcon, ShuffleIcon } from '../components/Icons';
import { SimilarShelf, Videos } from '../components/Discover';
import { Gallery } from '../components/Gallery';
import { albumArtwork, artistPhotos, demoPictures, releaseIdFrom } from '../enrich/artwork';
import { artistPosters } from '../enrich/posters';
import { AlbumVersions } from '../components/Versions';
import { groupEditions } from '../spotify/editions';
import { NotesSection } from '../components/Notes';
import { TagEditor } from '../components/Tags';
import { Card, Shelf, Status } from '../components/Shelf';
import { TrackRow } from '../components/TrackRow';
import { popularTracks } from '../discover';
import { albumInfo, artistInfo } from '../enrich';
import { formatDuration, names, year } from '../lib/format';
import { go } from '../lib/router';
import { invalidate, useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { Image, PlaylistEntry } from '../spotify/types';
import { commands } from '../state/player';
import { toast, ui } from '../state/ui';

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
  const articleUrl = info.data ? info.data.about?.url : undefined;
  const reception = useData(a && articleUrl ? `reception:${id}` : null, () =>
    isDemo() ? Promise.resolve(demoReception(a!.name)) : receptionFor(articleUrl!).then((v) => v ?? false),
  );
  const releaseId = info.data ? releaseIdFrom(info.data.links) : null;
  const artwork = useData(a && (releaseId || isDemo()) ? `artwork:${id}` : null, () =>
    isDemo() ? Promise.resolve(demoPictures('album', a!.name)) : albumArtwork(releaseId!).then((v) => v ?? []),
  );
  if (!a) return <div className="page"><Back /><Status loading={loading} error={error} /></div>;
  const tracks = a.tracks.items;
  // Spotify already shows the front cover, so the strip is only worth showing when there is more than that.
  const extra = (artwork.data || []).filter((p) => !p.label.startsWith('Front cover'));
  const pictures = extra.length ? artwork.data || [] : [];
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
      <section className="about"><TagEditor subject={{ subject_uri: a.uri, title: a.name, subtitle: names(a.artists), image: pickImage(a.images, 150) || null }} /></section>
      <Gallery title="Artwork" pictures={pictures} />
      <AlbumVersions album={a} />
      <NotesSection subject={{ subject_uri: a.uri, parent_uri: null, title: a.name, subtitle: names(a.artists), image: pickImage(a.images, 150) || null }} />
      {info.loading && <section className="about"><AboutSkeleton /></section>}
      {info.data && (
        <section className="about">
          <h2>About this album</h2>
          {info.data.about && <AboutText summary={info.data.about} />}
          <Facts items={info.data.facts} label={info.data.label} />
          {info.data.credits.length > 0 && <h2 className="credits-head">Credits</h2>}
          <Credits groups={info.data.credits} />
          <Links links={info.data.links} />
        </section>
      )}
      {reception.data && <Reception data={reception.data} />}
      {a.copyrights?.[0] && <p className="fineprint">{a.copyrights[0].text}</p>}
    </div>
  );
}

export function ArtistView({ id }: { id: string }) {
  const { data: a, loading, error } = useData(`artist:${id}`, () => api.artist(id));
  const disc = useData(`artist:${id}:albums`, () => api.artistAlbums(id));
  const info = useData(a ? `info:artist:${id}` : null, () => artistInfo(a!.name).then((v) => v ?? false));
  const place = useStore(concerts).place;
  const shows = useData(a && place ? `shows:${id}:${place.lat},${place.lon},${place.radius}` : null, () => showsNear(a!.name).then((v) => v ?? []));
  const bioUrl = info.data ? info.data.bio?.url : undefined;
  const photos = useData(a && (bioUrl || isDemo()) ? `photos:${id}` : null, () =>
    isDemo() ? Promise.resolve(demoPictures('artist', a!.name)) : artistPhotos(bioUrl!).then((v) => v ?? []),
  );
  const mbid = info.data ? info.data.mbid : undefined;
  const posters = useData(a && (mbid || isDemo()) ? `posters:${id}` : null, () =>
    isDemo() ? Promise.resolve(demoPictures('poster', a!.name)) : artistPosters(mbid!).then((v) => v ?? []),
  );
  const popular = useData(a ? `popular:${id}` : null, () => popularTracks(a!.name).then((v) => v ?? []));
  if (!a) return <div className="page"><Back /><Status loading={loading} error={error} /></div>;
  // One card per album: remasters and deluxe editions are folded together.
  const all = groupEditions(disc.data?.items || []);
  const albums = all.filter((g) => g.primary.album_type === 'album');
  const singles = all.filter((g) => g.primary.album_type !== 'album');
  const sub = (g: (typeof all)[number]) => [year(g.primary.release_date), g.editions.length > 1 && `${g.editions.length} versions`].filter(Boolean).join(' · ');
  return (
    <div className="page">
      <Hero images={a.images} round kicker="Artist" title={a.name} uri={a.uri} lines={[(a.genres?.length ? a.genres : info.data ? info.data.genres : []).slice(0, 3).join(' · ')]}>
        <button className="btn" onClick={() => ui.set({ mix: { kind: 'artist', seed: a.name } })}>Mix</button>
        <button className="btn" onClick={() => go(`/map/${encodeURIComponent(a.name)}`)}>Map</button>
        <SaveButton uri={a.uri} cacheKey="library:artists" labels={['Follow', 'Unfollow']} />
      </Hero>
      {!!popular.data?.length && (
        <section className="shelf">
          <h2>Popular</h2>
          <div className="rows">
            {popular.data.slice(0, 5).map((t, i) => (
              <TrackRow key={t.uri} track={t} number={i + 1} showArtist={false} onPlay={() => commands.playTracks(popular.data!.map((x) => x.uri), i)} />
            ))}
          </div>
        </section>
      )}
      {info.loading && <section className="about"><AboutSkeleton /></section>}
      {info.data && (
        <section className="about">
          {info.data.bio && <AboutText summary={info.data.bio} />}
          <Facts items={info.data.facts} />
          <Chips items={a.genres?.length ? a.genres.slice(0, 5) : info.data.genres} />
          <RelatedChips title="Members" items={info.data.members} />
          <RelatedChips title="Member of" items={info.data.memberOf} />
          {info.data.mbid && <button className="link-quiet" onClick={() => go(`/person/${info.data && info.data.mbid}`)}>Everything {a.name} is credited on →</button>}
          <Links links={info.data.links} />
        </section>
      )}
      <Status loading={disc.loading} error={disc.error} />
      {albums.length > 0 && (
        <Shelf title="Albums">
          {albums.map((g) => <Card key={g.primary.id} title={g.primary.name} subtitle={sub(g)} images={g.primary.images} to={`/album/${g.primary.id}`} />)}
        </Shelf>
      )}
      {singles.length > 0 && (
        <Shelf title="Singles & EPs">
          {singles.map((g) => <Card key={g.primary.id} title={g.primary.name} subtitle={sub(g)} images={g.primary.images} to={`/album/${g.primary.id}`} />)}
        </Shelf>
      )}
      {!!shows.data?.length && (
        <section className="about">
          <h2>Playing near {place?.name}</h2>
          <div className="concert-list concert-list-flush">
            {shows.data.map((c) => <ConcertCard key={c.id} concert={c} showArtist={false} />)}
          </div>
        </section>
      )}
      <Gallery title="Photos" pictures={photos.data || []} />
      <Gallery title="Posters" pictures={posters.data || []} tall />
      <SimilarShelf name={a.name} title="Similar artists" />
      <Videos query={`${a.name} live`} title="Live" />
      <section className="about"><TagEditor subject={{ subject_uri: a.uri, title: a.name, subtitle: '', image: pickImage(a.images, 150) || null }} /></section>
      <NotesSection subject={{ subject_uri: a.uri, parent_uri: null, title: a.name, subtitle: 'Artist', image: pickImage(a.images, 150) || null }} />
    </div>
  );
}

/** Move one item of a list to a new position, returning a new list. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function PlaylistView({ id }: { id: string }) {
  const { data: p, loading, error, reload } = useData(`playlist:${id}`, () => api.playlist(id));
  const meData = useData('me', api.me);
  // Spotify only shares track lists for playlists the user owns or collaborates on.
  const [entries, setEntries] = useState<PlaylistEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const loadFirst = () =>
    api.playlistItems(id).then(
      (page) => {
        setEntries(page.items);
        setNext(page.next);
      },
      () => setEntries([]),
    );
  useEffect(() => {
    setEntries(null);
    setEditing(false);
    loadFirst();
    // Reload the list whenever a different playlist is opened.
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className="page"><Back /><Status loading={loading} error={error} /></div>;
  const mine = p.owner.id === meData.data?.id || !!p.collaborative;
  const list = entries || [];
  const count = api.playlistCount(p);
  const hidden = entries !== null && list.length === 0 && (count ?? 0) > 0;

  const more = async () => {
    if (!next) return;
    setBusy(true);
    try {
      const page = await api.nextPage<PlaylistEntry>(next);
      setEntries([...list, ...page.items]);
      setNext(page.next);
    } catch {
      toast('Couldn’t load more tracks.');
    }
    setBusy(false);
  };

  // Each change shows at once, then is sent to Spotify; if Spotify refuses, the real list is reloaded.
  const change = async (optimistic: PlaylistEntry[], send: () => Promise<unknown>) => {
    setEntries(optimistic);
    setBusy(true);
    try {
      await send();
      invalidate('library:playlists');
    } catch {
      toast('Spotify didn’t accept that change.');
      await loadFirst();
    }
    setBusy(false);
  };
  const move = (from: number, to: number) => change(moveItem(list, from, to), () => api.movePlaylistItem(id, from, to));
  const remove = (index: number) => {
    const uri = api.entryTrack(list[index])?.uri;
    if (!uri) return;
    // Spotify removes every copy of a track at once, so the list does too.
    change(list.filter((e) => api.entryTrack(e)?.uri !== uri), () => api.removeFromPlaylist(id, [uri]));
  };

  const startEditing = () => {
    setName(p.name);
    setDescription(stripTags(p.description || ''));
    setEditing(true);
  };
  const saveDetails = async () => {
    const title = name.trim();
    if (!title) return;
    setBusy(true);
    try {
      await api.updatePlaylist(id, { name: title, description: description.trim() });
      invalidate('library:playlists');
      reload();
      toast('Playlist updated');
    } catch {
      toast('Couldn’t update the playlist.');
    }
    setBusy(false);
  };
  const removePlaylist = async () => {
    if (!window.confirm(`Delete “${p.name}”? This removes it from your Spotify library.`)) return;
    try {
      await api.deletePlaylist(p.uri);
      invalidate('library:playlists');
      toast('Playlist deleted');
      go('/library');
    } catch {
      toast('Couldn’t delete the playlist.');
    }
  };
  const detailsChanged = name.trim() !== p.name || description.trim() !== stripTags(p.description || '');

  return (
    <div className="page">
      <Hero
        images={p.images}
        kicker="Playlist"
        title={p.name}
        uri={p.uri}
        lines={[p.description ? stripTags(p.description) : null, [p.owner.display_name, count !== undefined && `${count} tracks`].filter(Boolean).join(' · ')]}
      >
        {mine && <button className="btn" onClick={() => (editing ? setEditing(false) : startEditing())}>{editing ? 'Done' : 'Edit'}</button>}
      </Hero>

      {editing && (
        <section className="about playlist-edit">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
          <label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="Optional" /></label>
          <div className="note-actions">
            <button className="btn btn-quiet btn-danger" onClick={removePlaylist}>Delete playlist</button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={saveDetails} disabled={busy || !name.trim() || !detailsChanged}>Save</button>
          </div>
          <p className="facts">Use the arrows to reorder and ✕ to remove. Changes are saved to Spotify as you make them.</p>
        </section>
      )}

      <Status loading={entries === null} />
      {hidden && (
        <p className="status">
          {mine
            ? 'This playlist is empty. Add songs from any track’s ··· menu.'
            : 'Spotify only shares the track list for playlists you own. You can still play this one — the queue shows what’s coming up.'}
        </p>
      )}
      <div className="rows">
        {list.map((entry, i) => {
          const t = api.entryTrack(entry);
          if (!t?.uri) return null;
          return editing ? (
            <div className="row edit-row" key={`${t.uri}-${i}`}>
              <span className="row-main">
                <Art images={t.album?.images} size={44} />
                <span className="row-text"><span className="row-title">{t.name}</span><span className="row-sub">{names(t.artists)}</span></span>
              </span>
              <button className="icon-btn" disabled={busy || i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${t.name} up`}>▲</button>
              <button className="icon-btn" disabled={busy || i === list.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${t.name} down`}>▼</button>
              <button className="icon-btn edit-remove" disabled={busy} onClick={() => remove(i)} aria-label={`Remove ${t.name}`}>✕</button>
            </div>
          ) : (
            <TrackRow key={`${t.uri}-${i}`} track={t} onPlay={() => commands.playContext(p.uri, t.uri)} />
          );
        })}
      </div>
      {next && <button className="btn btn-quiet more" onClick={more} disabled={busy}>{busy ? 'Loading…' : 'Show more'}</button>}
    </div>
  );
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
