import { names } from '../lib/format';
import { useData } from '../lib/useData';
import { NotConfigured, songInfo } from '../enrich';
import type { Track } from '../spotify/types';
import { AboutSkeleton } from './About';
import { Art } from './Art';
import { Videos } from './Discover';

export function SongInfoSheet({ track }: { track: Track }) {
  const artist = track.artists[0]?.name || '';
  const { data, loading, error } = useData(`info:song:${track.uri}`, () => songInfo(track.name, artist).then((v) => v ?? false));
  return (
    <div className="songinfo">
      <div className="row row-static actions-head">
        <Art images={track.album?.images} size={44} />
        <span className="row-text"><span className="row-title">{track.name}</span><span className="row-sub">{names(track.artists)}</span></span>
      </div>
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
            {data.writers.length > 0 && (<><dt>Written by</dt><dd>{data.writers.join(', ')}</dd></>)}
            {data.producers.length > 0 && (<><dt>Produced by</dt><dd>{data.producers.join(', ')}</dd></>)}
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
