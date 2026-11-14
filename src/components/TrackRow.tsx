import { formatTime, names } from '../lib/format';
import { useStore } from '../lib/store';
import type { Track } from '../spotify/types';
import { player } from '../state/player';
import { ui } from '../state/ui';
import { Art } from './Art';
import { MoreIcon } from './Icons';

export function TrackRow({
  track,
  onPlay,
  number,
  showArt = true,
  showArtist = true,
}: {
  track: Track;
  onPlay: () => void;
  number?: number;
  showArt?: boolean;
  showArtist?: boolean;
}) {
  const current = useStore(player).playback?.item?.uri === track.uri;
  return (
    <div className={`row ${current ? 'row-current' : ''}`}>
      <button className="row-main" onClick={onPlay}>
        {number !== undefined && <span className="row-num">{current ? '♪' : number}</span>}
        {showArt && <Art images={track.album?.images} size={44} />}
        <span className="row-text">
          <span className="row-title">{track.name}</span>
          {showArtist && (
            <span className="row-sub">
              {track.explicit && <span className="tag">E</span>}
              {names(track.artists)}
            </span>
          )}
        </span>
        <span className="row-time">{formatTime(track.duration_ms)}</span>
      </button>
      <button className="icon-btn row-more" aria-label={`More for ${track.name}`} onClick={() => ui.set({ actionsFor: track })}>
        <MoreIcon size={20} />
      </button>
    </div>
  );
}
