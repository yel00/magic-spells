import { useEffect, useRef } from 'react';
import { names } from '../lib/format';
import { useStore } from '../lib/store';
import { useData } from '../lib/useData';
import { activeLine, lyricsFor } from '../lyrics';
import { commands, player } from '../state/player';
import { AboutSkeleton } from './About';
import { Art } from './Art';
import { useProgress } from './useProgress';

/** Lyrics for whatever is playing. Synced lyrics follow the music; tap a line to jump to it. */
export function LyricsSheet() {
  const track = useStore(player).playback?.item;
  const progress = useProgress();
  const artist = track?.artists[0]?.name || '';
  const { data, loading } = useData(track ? `lyrics:${track.uri}` : null, () =>
    lyricsFor({ name: track!.name, artist, album: track!.album?.name, durationMs: track!.duration_ms }).then((v) => v ?? false),
  );
  const list = useRef<HTMLDivElement>(null);
  const touched = useRef(0);
  // Lyric timestamps mark when a line starts being sung; nudging ahead a little reads more naturally.
  const current = data && data.synced ? activeLine(data.lines, progress + 250) : -1;

  useEffect(() => {
    // Keep the current line in view, unless the listener has just scrolled to read ahead.
    if (current < 0 || Date.now() - touched.current < 4000) return;
    list.current?.querySelector<HTMLElement>(`[data-line="${current}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current]);

  if (!track) return <p className="status">Nothing playing.</p>;
  return (
    <div className="lyrics">
      <div className="row row-static actions-head">
        <Art images={track.album?.images} size={44} />
        <span className="row-text"><span className="row-title">{track.name}</span><span className="row-sub">{names(track.artists)}</span></span>
      </div>
      {loading && <AboutSkeleton />}
      {data === false && <p className="status">No lyrics found for this song.</p>}
      {data && data.instrumental && <p className="status">This one is instrumental.</p>}
      {data && !data.instrumental && (
        <>
          <div className="lyric-lines" ref={list} onTouchStart={() => (touched.current = Date.now())} onWheel={() => (touched.current = Date.now())}>
            {data.lines.map((line, i) =>
              data.synced ? (
                <button
                  key={i}
                  data-line={i}
                  className={`lyric ${i === current ? 'lyric-now' : i < current ? 'lyric-past' : ''}`}
                  onClick={() => {
                    touched.current = 0;
                    commands.seek(line.t!);
                  }}
                >
                  {line.text || '♪'}
                </button>
              ) : (
                <p key={i} className="lyric lyric-plain">{line.text || ' '}</p>
              ),
            )}
          </div>
          <p className="fineprint flush">
            {data.synced ? 'Synced lyrics from LRCLIB. Tap a line to jump to it.' : 'Lyrics from LRCLIB (not timed for this recording).'}
          </p>
        </>
      )}
    </div>
  );
}
