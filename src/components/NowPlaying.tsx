import { useRef, useState } from 'react';
import { formatTime, names } from '../lib/format';
import { go, pathForUri } from '../lib/router';
import { useStore } from '../lib/store';
import { commands, player, setVolume } from '../state/player';
import { openSheet, ui } from '../state/ui';
import { ascii, setAscii } from '../ascii/store';
import { useData } from '../lib/useData';
import { trackAnalysis } from '../tools/lookup';
import { Art, pickImage } from './Art';
import { AsciiCover, AsciiOptions } from './AsciiCover';
import { LikeButton } from './LikeButton';
import {
  ChevronDown, DeviceIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, QueueIcon, RepeatIcon, ShuffleIcon, VolumeIcon,
} from './Icons';
import { useProgress } from './useProgress';

/** The pace the ASCII cover moves at when a song's tempo isn't known. */
const DEFAULT_BPM = 120;

export function NowPlaying() {
  const { playback } = useStore(player);
  const live = useProgress();
  const [drag, setDrag] = useState<number | null>(null);
  const item = playback?.item;
  const look = useStore(ascii);
  const [options, setOptions] = useState(false);
  // A cover that can't be read as pixels is shown as the ordinary picture.
  const [unreadable, setUnreadable] = useState<string | null>(null);
  const cover = pickImage(item?.album?.images, 150);
  const asAscii = look.on && !!cover && unreadable !== cover;
  const tempo = useData(asAscii && item ? `tempo:${item.id}` : null, () =>
    trackAnalysis({ name: item!.name, artist: item!.artists[0]?.name || '', durationMs: item!.duration_ms }).then((a) => a?.bpm ?? 0, () => 0),
  );
  const bpm = Math.round(tempo.data || DEFAULT_BPM);
  const flip = () => {
    setAscii({ on: !look.on });
    setOptions(false);
  };
  // A tap flips the cover; pressing and holding it opens the effects.
  const hold = useRef<{ timer?: ReturnType<typeof setTimeout>; held: boolean }>({ held: false });
  const press = {
    onPointerDown: () => {
      hold.current.held = false;
      hold.current.timer = setTimeout(() => {
        hold.current.held = true;
        if (asAscii) setOptions(true);
      }, 450);
    },
    onPointerUp: () => clearTimeout(hold.current.timer),
    onPointerLeave: () => clearTimeout(hold.current.timer),
    onPointerCancel: () => clearTimeout(hold.current.timer),
    onContextMenu: (e: React.SyntheticEvent) => e.preventDefault(),
    onClick: () => {
      if (hold.current.held && asAscii) return;
      flip();
    },
  };
  if (!playback || !item) {
    return (
      <div className="now">
        <button className="icon-btn now-close" onClick={() => openSheet('none')} aria-label="Close"><ChevronDown /></button>
        <p className="status">Nothing playing.</p>
      </div>
    );
  }
  const pos = drag ?? live;
  const nav = (uri?: string) => {
    const path = pathForUri(uri);
    if (path) {
      openSheet('none');
      go(path);
    }
  };
  const canVolume = playback.device.supports_volume !== false && playback.device.volume_percent !== null;

  return (
    <div className="now">
      <div className="now-top">
        <button className="icon-btn" onClick={() => openSheet('none')} aria-label="Close"><ChevronDown /></button>
        <span className="now-context">Now playing</span>
        <button className="icon-btn" onClick={() => ui.set({ actionsFor: item })} aria-label="More"><MoreIcon /></button>
      </div>

      <div className="now-body">
        <div className="now-art">
          <div className="now-cover">
            <button className="cover-flip" {...press} aria-label={look.on ? 'Show the real cover' : 'Show the cover in ASCII'} aria-pressed={look.on}>
              {asAscii ? <AsciiCover key={cover} src={cover!} bpm={bpm} durationMs={item.duration_ms} onFail={() => setUnreadable(cover!)} /> : <Art images={item.album?.images} size={340} />}
            </button>
            {/* Kept off the picture: two quiet words under its corner. Pressing and holding the cover also opens the effects. */}
            {cover && unreadable !== cover && (
              <div className="cover-links">
                {asAscii && <button className={options ? 'on' : ''} onClick={() => setOptions(!options)} aria-expanded={options} aria-label="ASCII effects">fx</button>}
                <button className={look.on ? 'on' : ''} onClick={flip} aria-pressed={look.on} aria-label={look.on ? 'Show the real cover' : 'Show the cover in ASCII'}>ascii</button>
              </div>
            )}
            {asAscii && options && <AsciiOptions settings={look} bpm={bpm} guessed={!tempo.data} onClose={() => setOptions(false)} />}
          </div>
        </div>

        <div className="now-side">
          <div className="now-head">
            <div className="now-meta">
              <button className="now-title" onClick={() => nav(item.album?.uri)}>{item.name}</button>
              <button className="now-artist" onClick={() => nav(item.artists[0]?.uri)}>{names(item.artists)}</button>
              {item.album && <button className="now-album" onClick={() => nav(item.album?.uri)}>{item.album.name}</button>}
            </div>
            {item.uri.startsWith('spotify:track:') && <LikeButton key={item.uri} uri={item.uri} size={28} />}
          </div>

          <div className="scrub">
            <input
              type="range"
              min={0}
              max={item.duration_ms}
              value={pos}
              aria-label="Position"
              style={{ '--fill': `${(pos / item.duration_ms) * 100}%` } as React.CSSProperties}
              onChange={(e) => setDrag(Number(e.target.value))}
              onPointerUp={() => {
                if (drag !== null) commands.seek(drag);
                setDrag(null);
              }}
              onKeyUp={() => {
                if (drag !== null) commands.seek(drag);
                setDrag(null);
              }}
            />
            <div className="scrub-times"><span>{formatTime(pos)}</span><span>-{formatTime(item.duration_ms - pos)}</span></div>
          </div>

          <div className="transport">
            <button className={`icon-btn ${playback.shuffle_state ? 'on' : ''}`} onClick={commands.shuffle} aria-label="Shuffle" aria-pressed={playback.shuffle_state}><ShuffleIcon size={22} /></button>
            <button className="icon-btn" onClick={commands.previous} aria-label="Previous"><PrevIcon size={34} /></button>
            <button className="play-btn" onClick={commands.toggle} aria-label={playback.is_playing ? 'Pause' : 'Play'}>
              {playback.is_playing ? <PauseIcon size={34} /> : <PlayIcon size={34} />}
            </button>
            <button className="icon-btn" onClick={commands.next} aria-label="Next"><NextIcon size={34} /></button>
            <button className={`icon-btn ${playback.repeat_state !== 'off' ? 'on' : ''}`} onClick={commands.repeat} aria-label={`Repeat: ${playback.repeat_state}`}>
              <RepeatIcon size={22} />
              {playback.repeat_state === 'track' && <span className="badge">1</span>}
            </button>
          </div>

          {canVolume && (
            <div className="volume">
              <VolumeIcon size={18} />
              <input
                type="range"
                min={0}
                max={100}
                value={playback.device.volume_percent ?? 0}
                aria-label="Volume"
                style={{ '--fill': `${playback.device.volume_percent ?? 0}%` } as React.CSSProperties}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </div>
          )}

          <div className="now-bottom">
            <button className="pill" onClick={() => openSheet('devices')}>
              <DeviceIcon type={playback.device.type} size={18} />
              <span>{playback.device.name}</span>
            </button>
            <button className="pill" onClick={() => ui.set({ lyrics: true })}><span>Lyrics</span></button>
            <button className="pill" onClick={() => ui.set({ infoFor: item })}><span>About</span></button>
            <button className="pill pill-icon" onClick={() => openSheet('queue')} aria-label="Queue"><QueueIcon size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
