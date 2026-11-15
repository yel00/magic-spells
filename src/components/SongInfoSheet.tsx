import { names } from '../lib/format';
import { useData } from '../lib/useData';
import { NotConfigured, songInfo } from '../enrich';
import type { Track } from '../spotify/types';
import { AboutSkeleton } from './About';
import { Art } from './Art';
import { Videos } from './Discover';
import { SongTabs } from './Tabs';
import { SongVersions } from './Versions';
import { trackAnalysis } from '../tools/lookup';
import { camelot, keyName } from '../tools/keys';
import { go } from '../lib/router';
import { ui } from '../state/ui';

/** Names from Genius, each linking to that person's credits page. */
function People({ names: list }: { names: string[] }) {
  const open = (name: string) => {
    ui.set({ infoFor: null, sheet: 'none' });
    go(`/person/${encodeURIComponent(`~${name}`)}`);
  };
  return (
    <span className="people">
      {list.map((n, i) => (
        <span key={n}>{i > 0 && ', '}<button className="credit-name" onClick={() => open(n)}>{n}</button></span>
      ))}
    </span>
  );
}

export function SongInfoSheet({ track }: { track: Track }) {
  const artist = track.artists[0]?.name || '';
  const { data, loading, error } = useData(`info:song:${track.uri}`, () => songInfo(track.name, artist).then((v) => v ?? false));
  const analysis = useData(`info:tempo:${track.uri}`, () => trackAnalysis({ name: track.name, artist, durationMs: track.duration_ms }).then((v) => v ?? false));
  const openTools = () => {
    ui.set({ infoFor: null, sheet: 'none' });
    go('/tools');
  };
  return (
    <div className="songinfo">
      <div className="row row-static actions-head">
        <Art images={track.album?.images} size={44} />
        <span className="row-text"><span className="row-title">{track.name}</span><span className="row-sub">{names(track.artists)}</span></span>
      </div>
      <div className="tempo-row">
        {analysis.loading && <span className="facts">Looking up tempo and key…</span>}
        {analysis.data && (
          <>
            <span className="tempo-stat"><strong>≈ {analysis.data.bpm}</strong> BPM</span>
            {analysis.data.key && <span className="tempo-stat"><strong>{keyName(analysis.data.key)}</strong> · {camelot(analysis.data.key)}</span>}
          </>
        )}
        {analysis.data === false && <span className="facts">No tempo or key on record for this one.</span>}
        <button className="link-quiet" onClick={openTools}>{analysis.data ? 'Check by ear' : 'Measure by ear'}</button>
      </div>
      <SongTabs uri={track.uri} title={track.name} artist={artist} />
      <SongVersions track={track} />
      <Videos query={`${artist} ${track.name} live`} title="Live & other versions" />
      {loading && <AboutSkeleton />}
      {error && (
        <p className="status">
          {error instanceof NotConfigured
            ? 'Song background comes from Genius, which isn’t connected yet. Add a Genius access token to the server to turn this on.'
            : 'Couldn’t load the song background just now.'}
        </p>
      )}
      {data === false && <p className="status">Genius has nothing on this song.</p>}
      {data && (
        <>
          {data.description && <p className="songinfo-text">{data.description}</p>}
          <dl className="songinfo-facts">
            {data.released && (<><dt>Released</dt><dd>{data.released}</dd></>)}
            {data.writers.length > 0 && (<><dt>Written by</dt><dd><People names={data.writers} /></dd></>)}
            {data.producers.length > 0 && (<><dt>Produced by</dt><dd><People names={data.producers} /></dd></>)}
            {data.related.map((r) => (
              <div key={r.label} className="songinfo-related">
                <dt>{r.label}</dt>
                <dd>
                  {r.songs.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.title} — {s.artist}</a>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <a className="btn btn-wide" href={data.url} target="_blank" rel="noreferrer">Lyrics and annotations on Genius ↗</a>
        </>
      )}
    </div>
  );
}
