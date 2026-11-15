import { useState } from 'react';
import { ChevronLeft } from '../components/Icons';
import { Card, Grid, Status } from '../components/Shelf';
import { names, year } from '../lib/format';
import { go } from '../lib/router';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { AlbumRef, Artist } from '../spotify/types';

/**
 * A page of everything Spotify files under one label or genre. Spotify returns
 * ten at a time for personal apps, so the list grows as "Show more" is tapped.
 */
export function BrowseView({ kind, name }: { kind: 'label' | 'genre'; name: string }) {
  const first = useData(`browse:${kind}:${name.toLowerCase()}`, () => api.browse(kind, name, 0));
  const [extra, setExtra] = useState<(AlbumRef | Artist)[]>([]);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = (kind === 'label' ? first.data?.albums?.items : first.data?.artists?.items) || [];
  const items = [...base, ...extra].filter(Boolean);
  const total = (kind === 'label' ? first.data?.albums?.total : first.data?.artists?.total) ?? 0;

  const more = async () => {
    setBusy(true);
    try {
      const r = await api.browse(kind, name, items.length);
      const next = ((kind === 'label' ? r.albums?.items : r.artists?.items) || []).filter(Boolean);
      const seen = new Set(items.map((i) => i.id));
      const fresh = next.filter((i) => !seen.has(i.id));
      if (!fresh.length) setDone(true);
      setExtra([...extra, ...fresh]);
    } catch {
      setDone(true);
    }
    setBusy(false);
  };

  return (
    <div className="page">
      <header className="page-head person-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <div className="row-text">
          <span className="kicker">{kind === 'label' ? 'Label' : 'Genre'}</span>
          <h1 className={kind === 'genre' ? 'capitalize' : ''}>{name}</h1>
        </div>
      </header>
      <Status loading={first.loading} error={first.error} empty={first.data && !items.length && `Spotify lists nothing under this ${kind}.`} />
      <Grid>
        {kind === 'label'
          ? (items as AlbumRef[]).map((a) => <Card key={a.id} title={a.name} subtitle={`${names(a.artists)} · ${year(a.release_date)}`} images={a.images} to={`/album/${a.id}`} />)
          : (items as Artist[]).map((a) => <Card key={a.id} title={a.name} images={a.images} to={`/artist/${a.id}`} round />)}
      </Grid>
      {kind === 'genre' && (
        <p className="fineprint">
          Where this genre sits among the others:{' '}
          <button className="link-quiet inline" onClick={() => go(`/genres/${encodeURIComponent(name)}`)}>genre map</button>{' · '}
          <a className="link-quiet inline" href="https://cratto.app/genres" target="_blank" rel="noreferrer">Cratto ↗</a>{' · '}
          <a className="link-quiet inline" href="https://musicmap.info" target="_blank" rel="noreferrer">Musicmap ↗</a>
        </p>
      )}
      {!done && items.length > 0 && items.length < Math.min(total, 1000) && (
        <button className="btn btn-quiet more" onClick={more} disabled={busy}>{busy ? 'Loading…' : 'Show more'}</button>
      )}
    </div>
  );
}
