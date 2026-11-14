import { useEffect, useState } from 'react';
import { names } from '../lib/format';
import { useStore } from '../lib/store';
import * as api from '../spotify/api';
import type { Queue } from '../spotify/types';
import { player } from '../state/player';
import { Art } from './Art';

export function QueueSheet() {
  const currentUri = useStore(player).playback?.item?.uri;
  const [queue, setQueue] = useState<Queue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.getQueue().then((q) => live && setQueue(q), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [currentUri]);

  if (failed) return <p className="status">Couldn’t load the queue.</p>;
  if (!queue) return <div className="status"><span className="spinner" /></div>;
  const now = queue.currently_playing;
  return (
    <div className="queue">
      {now && (
        <>
          <h3>Now playing</h3>
          <div className="row row-current row-static">
            <Art images={now.album?.images} size={44} />
            <span className="row-text"><span className="row-title">{now.name}</span><span className="row-sub">{names(now.artists)}</span></span>
          </div>
        </>
      )}
      <h3>Next up</h3>
      {queue.queue.length === 0 && <p className="status">Nothing queued.</p>}
      {queue.queue.map((t, i) => (
        <div className="row row-static" key={`${t.uri}-${i}`}>
          <Art images={t.album?.images} size={44} />
          <span className="row-text"><span className="row-title">{t.name}</span><span className="row-sub">{names(t.artists)}</span></span>
        </div>
      ))}
    </div>
  );
}
