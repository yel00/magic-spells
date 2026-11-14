import { names } from '../lib/format';
import { useStore } from '../lib/store';
import { commands, player } from '../state/player';
import { openSheet } from '../state/ui';
import { Art } from './Art';
import { DeviceIcon, NextIcon, PauseIcon, PlayIcon, SpeakerIcon } from './Icons';
import { useProgress } from './useProgress';

export function MiniPlayer() {
  const { playback, loaded } = useStore(player);
  const progress = useProgress();
  if (!loaded) return <div className="mini mini-idle" />;

  if (!playback || !playback.item) {
    return (
      <div className="mini mini-idle">
        <button className="mini-main" onClick={() => openSheet('devices')}>
          <span className="mini-noart"><SpeakerIcon size={20} /></span>
          <span className="row-text">
            <span className="row-title">Nothing playing</span>
            <span className="row-sub">{playback ? playback.device.name : 'Choose where to play'}</span>
          </span>
        </button>
      </div>
    );
  }

  const { item, device, is_playing } = playback;
  const pct = item.duration_ms ? (progress / item.duration_ms) * 100 : 0;
  return (
    <div className="mini">
      <div className="mini-progress"><span style={{ width: `${pct}%` }} /></div>
      <button className="mini-main" onClick={() => openSheet('now')}>
        <Art images={item.album?.images} size={44} />
        <span className="row-text">
          <span className="row-title">{item.name}</span>
          <span className="row-sub">{names(item.artists)}</span>
        </span>
      </button>
      <button className="mini-device" onClick={() => openSheet('devices')} aria-label={`Playing on ${device.name}. Change device`}>
        <DeviceIcon type={device.type} size={18} />
        <span>{device.name}</span>
      </button>
      <button className="icon-btn" onClick={commands.toggle} aria-label={is_playing ? 'Pause' : 'Play'}>
        {is_playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
      </button>
      <button className="icon-btn mini-next" onClick={commands.next} aria-label="Next track">
        <NextIcon size={24} />
      </button>
    </div>
  );
}
