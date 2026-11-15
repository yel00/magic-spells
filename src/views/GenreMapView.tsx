import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, SearchIcon } from '../components/Icons';
import { MapCanvas, type DrawnNode } from '../components/MapCanvas';
import { norm } from '../enrich/text';
import { go } from '../lib/router';
import type { MapEdge, Point } from '../map/layout';

interface Genre {
  n: string;
  t: string;
  s: number;
  f: number;
  p: number[];
  i: number[];
  x: number;
  y: number;
}

interface GenreData {
  source: string;
  built: string;
  families: string[];
  genres: Genre[];
}

const FAMILY_COLOURS = ['#a2d2ff', '#ffb4a2', '#e9d8a6', '#f4a261', '#f1c0e8', '#c9b6ff', '#9ad1d4', '#8ecae6', '#b7e4c7', '#ffafcc', '#d4a373', '#95d5b2', '#fefae0'];
const OTHER = '#8f8d99';

let loaded: Promise<GenreData> | null = null;
const load = (): Promise<GenreData> =>
  (loaded ??= fetch('/genres.json')
    .then((r) => (r.ok ? (r.json() as Promise<GenreData>) : Promise.reject(new Error('Genre data is missing.'))))
    .catch((e) => {
      loaded = null;
      throw e;
    }));

/** A map of music genres: what each is a kind of, and what it grew out of. Built from Wikidata. */
export function GenreMapView({ start }: { start?: string }) {
  const [data, setData] = useState<GenreData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    load().then(
      (d) => {
        setData(d);
        if (start) {
          const at = d.genres.findIndex((x: Genre) => norm(x.n) === norm(start));
          if (at >= 0) {
            setSelected(String(at));
            setFocus(String(at));
          }
        }
      },
      () => setFailed(true),
    );
  }, [start]);

  const { nodes, edges, positions, kids } = useMemo(() => {
    const genres = data?.genres || [];
    const nodes: DrawnNode[] = genres.map((g, i) => ({ id: String(i), label: g.n, size: g.s, kind: 'near', colour: g.f >= 0 ? FAMILY_COLOURS[g.f % FAMILY_COLOURS.length] : OTHER }));
    const edges: MapEdge[] = genres.flatMap((g, i) => [...g.p.map((p) => ({ a: String(i), b: String(p), w: 0.85 })), ...g.i.map((p) => ({ a: String(i), b: String(p), w: 0.4 }))]);
    const positions = new Map<string, Point>(genres.map((g, i) => [String(i), { x: g.x, y: g.y }]));
    const kids = new Map<number, number[]>();
    genres.forEach((g, i) => g.p.forEach((p) => kids.set(p, [...(kids.get(p) || []), i])));
    return { nodes, edges, positions, kids };
  }, [data]);

  const pick = (i: number) => {
    setSelected(String(i));
    setFocus(String(i));
    setQuery('');
  };
  const g = data && selected !== null ? data.genres[Number(selected)] : null;
  const matches = data && query.trim().length > 1 ? data.genres.map((x, i) => ({ x, i })).filter(({ x }) => norm(x.n).includes(norm(query))).slice(0, 8) : [];
  const children = g ? (kids.get(Number(selected)) || []).sort((a, b) => data!.genres[b].s - data!.genres[a].s) : [];
  const Chip = ({ i }: { i: number }) => <button className="chip chip-tap" onClick={() => pick(i)}>{data!.genres[i].n}</button>;

  return (
    <div className="mapview">
      <header className="tab-head">
        <button className="icon-btn" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <span className="row-text"><span className="kicker">Genres</span><span className="row-title map-title">Map</span></span>
      </header>
      {failed && <p className="status">The genre map couldn’t be loaded.</p>}
      {!data && !failed && <div className="status"><span className="spinner" /></div>}
      {data && (
        <>
          <div className="genre-search">
            <label className="searchbox">
              <SearchIcon size={18} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Find one of ${data.genres.length.toLocaleString()} genres`} autoCorrect="off" spellCheck={false} />
            </label>
            {matches.length > 0 && (
              <div className="genre-matches">
                {matches.map(({ x, i }) => <button key={i} className="action" onClick={() => pick(i)}>{x.n}</button>)}
              </div>
            )}
          </div>
          <MapCanvas nodes={nodes} edges={edges} positions={positions} selected={selected} onSelect={setSelected} detail focus={focus} />
          {g ? (
            <div className="map-card genre-card">
              <div className="map-card-head">
                <span className="row-text">
                  <span className="row-title capitalize">{g.n}</span>
                  <span className="row-sub">{g.f >= 0 ? `${data.families[g.f]} family` : 'Not placed in a family'}{children.length ? ` · ${children.length} kinds` : ''}</span>
                </span>
                <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">✕</button>
              </div>
              {g.p.length > 0 && <div className="genre-rel"><h3>A kind of</h3><div className="chips">{g.p.map((i) => <Chip key={i} i={i} />)}</div></div>}
              {g.i.length > 0 && <div className="genre-rel"><h3>Grew out of</h3><div className="chips">{g.i.map((i) => <Chip key={i} i={i} />)}</div></div>}
              {children.length > 0 && <div className="genre-rel"><h3>Kinds of {g.n}</h3><div className="chips">{children.slice(0, 10).map((i) => <Chip key={i} i={i} />)}</div></div>}
              <div className="map-card-actions">
                <button className="btn btn-primary btn-small" onClick={() => go(`/genre/${encodeURIComponent(g.n)}`)}>Artists on Spotify</button>
                <a className="btn btn-small" href={`https://en.wikipedia.org/wiki/${encodeURIComponent(g.t.replace(/ /g, '_'))}`} target="_blank" rel="noreferrer">Wikipedia ↗</a>
              </div>
            </div>
          ) : (
            <p className="map-foot">
              Zoom in for more genres; tap one to see what it is a kind of and what grew out of it. Colours are families. Data from Wikidata, {data.built}.{' '}
              <a href="https://cratto.app/genres" target="_blank" rel="noreferrer">Cratto ↗</a> · <a href="https://musicmap.info" target="_blank" rel="noreferrer">Musicmap ↗</a>
            </p>
          )}
        </>
      )}
    </div>
  );
}
