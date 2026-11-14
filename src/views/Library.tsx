import { useState } from 'react';
import { Card, Grid, Status } from '../components/Shelf';
import { TrackRow } from '../components/TrackRow';
import { names } from '../lib/format';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { Paging } from '../spotify/types';
import { commands } from '../state/player';

const TABS = ['Playlists', 'Albums', 'Artists', 'Songs'] as const;
type Tab = (typeof TABS)[number];

let remembered: Tab = 'Playlists';

/** A list that starts with the first page and grows as "Show more" is tapped. */
function usePaged<T>(key: string, first: () => Promise<Paging<T>>) {
  const base = useData(key, first);
  const [extra, setExtra] = useState<{ items: T[]; next: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const items = [...(base.data?.items || []), ...(extra?.items || [])];
  const next = extra ? extra.next : base.data?.next;
  const more = async () => {
    if (!next || busy) return;
    setBusy(true);
    try {
      const raw: any = await api.nextPage<T>(next);
      const page: Paging<T> = raw.artists ?? raw; // followed artists come wrapped
      setExtra({ items: [...(extra?.items || []), ...page.items], next: page.next });
    } finally {
      setBusy(false);
    }
  };
  return { ...base, items, more: next ? more : null, busy };
}

function More({ more, busy }: { more: (() => void) | null; busy: boolean }) {
  if (!more) return null;
  return <button className="btn btn-quiet more" onClick={more} disabled={busy}>{busy ? 'Loading…' : 'Show more'}</button>;
}

function Playlists() {
  const d = usePaged('library:playlists', api.myPlaylists);
  return (
    <>
      <Status loading={d.loading} error={d.error} empty={d.data && !d.items.length && 'No playlists yet.'} />
      <Grid>
        {d.items.filter(Boolean).map((p) => {
          const n = api.playlistCount(p);
          return <Card key={p.id} title={p.name} subtitle={n !== undefined ? `${n} tracks` : p.owner.display_name || ''} images={p.images} to={`/playlist/${p.id}`} />;
        })}
      </Grid>
      <More {...d} />
    </>
  );
}

function Albums() {
  const d = usePaged('library:albums', api.savedAlbums);
  return (
    <>
      <Status loading={d.loading} error={d.error} empty={d.data && !d.items.length && 'No saved albums yet.'} />
      <Grid>
        {d.items.map(({ album }) => <Card key={album.id} title={album.name} subtitle={names(album.artists)} images={album.images} to={`/album/${album.id}`} />)}
      </Grid>
      <More {...d} />
    </>
  );
}

function Artists() {
  const d = usePaged('library:artists', api.followedArtists);
  return (
    <>
      <Status loading={d.loading} error={d.error} empty={d.data && !d.items.length && 'You’re not following any artists yet.'} />
      <Grid>
        {d.items.map((a) => <Card key={a.id} title={a.name} images={a.images} to={`/artist/${a.id}`} round />)}
      </Grid>
      <More {...d} />
    </>
  );
}

function Songs() {
  const d = usePaged('library:tracks', api.savedTracks);
  const uris = d.items.map((i) => i.track.uri);
  return (
    <>
      <Status loading={d.loading} error={d.error} empty={d.data && !d.items.length && 'No liked songs yet.'} />
      <div className="rows">
        {d.items.map(({ track }, i) => <TrackRow key={track.id} track={track} onPlay={() => commands.playTracks(uris, i)} />)}
      </div>
      <More {...d} />
    </>
  );
}

export function Library() {
  const [tab, setTabState] = useState<Tab>(remembered);
  const setTab = (t: Tab) => {
    remembered = t;
    setTabState(t);
  };
  return (
    <div className="page">
      <header className="page-head"><h1>Library</h1></header>
      <div className="segments" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'Playlists' && <Playlists />}
      {tab === 'Albums' && <Albums />}
      {tab === 'Artists' && <Artists />}
      {tab === 'Songs' && <Songs />}
    </div>
  );
}
