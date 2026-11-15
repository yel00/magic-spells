import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from '../components/Icons';
import { MapCanvas, type DrawnNode } from '../components/MapCanvas';
import { findOnSpotify, similarArtists, weightAt } from '../discover';
import { mapLimit } from '../discover/mix';
import { norm } from '../enrich/text';
import { go } from '../lib/router';
import { edgesAmong, recommend, type Recommendation, type SimilarList } from '../map/graph';
import { clusters, layout, type MapEdge, type Point } from '../map/layout';
import { gatherLibrary, type LibraryArtist } from '../map/library';
import { isDemo } from '../spotify/auth';
import { commands } from '../state/player';
import { toast, ui } from '../state/ui';

interface Built {
  nodes: DrawnNode[];
  edges: MapEdge[];
  positions: [string, Point][];
  recs: Recommendation[];
  playlists: string[];
  membership: Record<string, string[]>;
  at: number;
}

function Card({ node, rec, playlists, onClose }: { node: DrawnNode; rec?: Recommendation; playlists?: string[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const withArtist = async (then: (a: { id: string; uri: string }) => void) => {
    setBusy(true);
    const a = await findOnSpotify(node.label).catch(() => null);
    setBusy(false);
    if (a) then(a);
    else toast(`${node.label} isn’t on Spotify under that name.`);
  };
  return (
    <div className="map-card">
      <div className="map-card-head">
        <span className="row-text">
          <span className="row-title">{node.label}</span>
          <span className="row-sub">
            {rec ? `Close to ${rec.because.slice(0, 3).map((b) => b.name).join(', ')}${rec.because.length > 3 ? ` and ${rec.because.length - 3} more` : ''}`
              : playlists?.length ? `In ${playlists.slice(0, 2).join(', ')}${playlists.length > 2 ? ` and ${playlists.length - 2} more` : ''}`
              : node.kind === 'centre' ? 'The centre of this map' : node.kind === 'mine' ? 'In your library' : 'Similar artist'}
          </span>
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="map-card-actions">
        <button className="btn btn-primary btn-small" disabled={busy} onClick={() => withArtist((a) => commands.playContext(a.uri))}>Play</button>
        <button className="btn btn-small" disabled={busy} onClick={() => withArtist((a) => go(`/artist/${a.id}`))}>Artist page</button>
        {node.kind !== 'centre' && <button className="btn btn-small" onClick={() => go(`/map/${encodeURIComponent(node.label)}`)}>Map from here</button>}
        <button className="btn btn-small" onClick={() => ui.set({ mix: { kind: 'artist', seed: node.label } })}>Mix</button>
      </div>
    </div>
  );
}

function Frame({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="mapview">
      <header className="tab-head">
        <button className="icon-btn" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <span className="row-text"><span className="kicker">{kicker}</span><span className="row-title map-title">{title}</span></span>
      </header>
      {children}
    </div>
  );
}

/** A map of the artists most similar to one artist: closer means more alike. */
export function ArtistMapView({ name }: { name: string }) {
  const [lists, setLists] = useState<SimilarList[] | null>(null);
  const [settled, setSettled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [source, setSource] = useState('');

  useEffect(() => {
    let live = true;
    setLists(null);
    setSettled(false);
    setSelected(null);
    (async () => {
      const centre = await similarArtists(name).catch(() => null);
      if (!live) return;
      setSource(centre?.source || '');
      setLists([{ of: name, result: centre }]);
      if (!centre) return setSettled(true);
      // Then ask about the nearest neighbours too, to learn which of them are close to each other.
      const more = await mapLimit(centre.names.slice(0, 8), 3, async (n) => ({ of: n, result: await similarArtists(n).catch(() => null) }));
      if (!live) return;
      setLists([{ of: name, result: centre }, ...more]);
      setSettled(true);
    })();
    return () => {
      live = false;
    };
  }, [name]);

  const { nodes, edges, positions } = useMemo(() => {
    const centre = lists?.[0]?.result;
    if (!centre) return { nodes: [] as DrawnNode[], edges: [] as MapEdge[], positions: new Map<string, Point>() };
    const shown = centre.names.slice(0, 22);
    const nodes: DrawnNode[] = [
      { id: norm(name), label: name, size: 1, pinned: true, kind: 'centre' },
      ...shown.filter((n) => norm(n) !== norm(name)).map((n, i): DrawnNode => ({ id: norm(n), label: n, size: 0.15 + 0.6 * weightAt(centre, i), kind: 'near' })),
    ];
    const ids = new Set(nodes.map((n) => n.id));
    const spokes: MapEdge[] = shown.map((n, i) => ({ a: norm(name), b: norm(n), w: weightAt(centre, i) })).filter((e) => e.a !== e.b);
    const cross = edgesAmong((lists || []).slice(1), ids).filter((e) => e.a !== norm(name) && e.b !== norm(name));
    const edges = [...spokes, ...cross];
    const groups = clusters(nodes.slice(1), cross);
    nodes.forEach((n) => (n.group = groups.get(n.id)));
    return { nodes, edges, positions: layout(nodes, edges) };
  }, [lists, name]);

  const picked = nodes.find((n) => n.id === selected);
  return (
    <Frame kicker="Similar artists" title={name}>
      {lists === null && <div className="status"><span className="spinner" /></div>}
      {lists && !nodes.length && <p className="status">Nothing is known yet about artists similar to {name}.</p>}
      {nodes.length > 0 && <MapCanvas nodes={nodes} edges={edges} positions={positions} selected={selected} onSelect={setSelected} />}
      {picked && <Card node={picked} onClose={() => setSelected(null)} />}
      {nodes.length > 0 && !picked && (
        <p className="map-foot">
          Closer means more alike. Tap a name. {settled ? `From ${source}.` : 'Working out who is close to whom…'}{' '}
          <a href={`https://www.music-map.com/${encodeURIComponent(name.toLowerCase()).replace(/%20/g, '+')}`} target="_blank" rel="noreferrer">Music-Map ↗</a>
        </p>
      )}
    </Frame>
  );
}

const STORE = () => `ms.map:library${isDemo() ? ':demo' : ''}`;
const WEEK = 7 * 86_400_000;

function loadBuilt(): Built | null {
  try {
    const b = JSON.parse(localStorage.getItem(STORE()) || 'null') as Built | null;
    return b && Date.now() - b.at < WEEK ? b : null;
  } catch {
    return null;
  }
}

async function buildLibraryMap(onStep: (label: string, done?: number, total?: number) => void): Promise<Built | null> {
  const library = await gatherLibrary(onStep);
  if (library.artists.length < 3) return null;
  // The map shows the hundred artists that matter most; all of them count as "known" when recommending.
  const shown = library.artists.slice(0, 100);
  let done = 0;
  onStep('Finding who is close to whom…', 0, shown.length);
  const lists: SimilarList[] = await mapLimit(shown, 4, async (a: LibraryArtist) => {
    const result = await similarArtists(a.name).catch(() => null);
    onStep('Finding who is close to whom…', ++done, shown.length);
    return { of: a.name, result };
  });
  const known = new Set(library.artists.map((a) => norm(a.name)));
  const ids = new Set(shown.map((a) => norm(a.name)));
  const recs = recommend(lists, known, 24).filter((r) => r.because.some((b) => ids.has(norm(b.name))));
  const edges = edgesAmong(lists, ids);
  const mine: DrawnNode[] = shown.map((a) => ({ id: norm(a.name), label: a.name, size: 0.1 + 0.9 * a.weight, kind: 'mine' }));
  const groups = clusters(mine, edges);
  mine.forEach((n) => (n.group = groups.get(n.id)));
  const recNodes: DrawnNode[] = recs.map((r) => ({ id: norm(r.name), label: r.name, size: 0.3, kind: 'rec' }));
  const recEdges: MapEdge[] = recs.flatMap((r) => r.because.filter((b) => ids.has(norm(b.name))).slice(0, 4).map((b) => ({ a: norm(r.name), b: norm(b.name), w: b.w })));
  const nodes = [...mine, ...recNodes];
  const all = [...edges, ...recEdges];
  const built: Built = {
    nodes, edges: all, positions: [...layout(nodes, all)], recs, playlists: library.playlists,
    membership: Object.fromEntries(shown.filter((a) => a.playlists.length).map((a) => [norm(a.name), a.playlists])), at: Date.now(),
  };
  try {
    localStorage.setItem(STORE(), JSON.stringify(built));
  } catch {
    /* too big to keep: it will simply be rebuilt next time */
  }
  return built;
}

/** A map of the listener's own music, with nearby artists they don't have yet marked as recommendations. */
export function LibraryMapView() {
  const [built, setBuilt] = useState<Built | null>(loadBuilt);
  const [progress, setProgress] = useState<{ label: string; done?: number; total?: number } | null>(null);
  const [empty, setEmpty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState('');
  const [showRecs, setShowRecs] = useState(true);

  const build = async () => {
    setProgress({ label: 'Starting…' });
    setEmpty(false);
    const b = await buildLibraryMap((label, done, total) => setProgress({ label, done, total })).catch(() => null);
    setProgress(null);
    if (b) setBuilt(b);
    else setEmpty(true);
  };
  useEffect(() => {
    if (!built) build();
    // Build once on first open; "Rebuild" does it again on request.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const positions = useMemo(() => new Map(built?.positions || []), [built]);
  const nodes = useMemo(
    () => (built?.nodes || []).filter((n) => showRecs || n.kind !== 'rec').map((n) => ({ ...n, dim: !!playlist && !(built!.membership[n.id] || []).includes(playlist) })),
    [built, playlist, showRecs],
  );
  const edges = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return (built?.edges || []).filter((e) => ids.has(e.a) && ids.has(e.b));
  }, [built, nodes]);
  const picked = nodes.find((n) => n.id === selected);
  const rec = built?.recs.find((r) => norm(r.name) === selected);

  return (
    <Frame kicker="Your music" title="Map">
      {progress && (
        <div className="mix-building map-building">
          <p>{progress.label}{progress.total ? ` ${progress.done} of ${progress.total}` : ''}</p>
          <div className="bar"><span style={{ width: `${progress.total ? ((progress.done || 0) / progress.total) * 100 : 8}%` }} /></div>
          <p className="facts">The first build takes a minute or two. After that the map opens instantly for a week.</p>
        </div>
      )}
      {empty && !progress && <p className="status">There isn’t enough listening history yet to draw a map. Play, like or follow some artists and try again.</p>}
      {built && !progress && (
        <>
          <div className="map-tools">
            {built.playlists.length > 0 && (
              <select value={playlist} onChange={(e) => setPlaylist(e.target.value)} aria-label="Highlight a playlist">
                <option value="">All your music</option>
                {built.playlists.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <button className={`pill map-toggle ${showRecs ? 'on' : ''}`} aria-pressed={showRecs} onClick={() => setShowRecs(!showRecs)}>Recommendations</button>
            {built.recs.length > 0 && (
              <button
                className="pill map-toggle"
                onClick={() => ui.set({ mix: { kind: 'names', title: 'From your map', description: 'Made by Magic Spells: artists that sit close to several you already play.', names: built.recs.map((r) => r.name) } })}
              >
                Play them
              </button>
            )}
          </div>
          <MapCanvas nodes={nodes} edges={edges} positions={positions} selected={selected} onSelect={setSelected} />
          {picked && <Card node={picked} rec={rec} playlists={built.membership[picked.id]} onClose={() => setSelected(null)} />}
          {!picked && (
            <p className="map-foot">
              Bigger names are ones you play more; colours are neighbourhoods. Dashed gold names are recommendations: artists you don’t have that sit near several you do.{' '}
              <button className="link-quiet inline" onClick={build}>Rebuild</button>
            </p>
          )}
        </>
      )}
    </Frame>
  );
}
