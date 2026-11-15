import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, PauseIcon, PlayIcon, RepeatIcon } from '../components/Icons';
import { commands, player } from '../state/player';
import { getTab, type TabFile } from '../tools/tabs';

// alphaTab is loaded on demand from /alphatab (about 1.2 MB plus sounds), so
// the rest of the app stays small for people who never open a tab.
let loading: Promise<any> | null = null;
function loadAlphaTab(): Promise<any> {
  if ((window as any).alphaTab) return Promise.resolve((window as any).alphaTab);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/alphatab/alphaTab.min.js';
      s.onload = () => resolve((window as any).alphaTab);
      s.onerror = () => {
        loading = null;
        reject(new Error('The tab player couldn’t be loaded.'));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

interface Part {
  index: number;
  name: string;
}

const SPEEDS = [0.5, 0.75, 1];

export function TabPlayerView({ id }: { id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const api = useRef<any>(null);
  const [tab, setTab] = useState<TabFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [part, setPart] = useState(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [click, setClick] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [file, alphaTab] = await Promise.all([getTab(id), loadAlphaTab()]);
        if (!live) return;
        if (!file) return setError('That tab isn’t on this device any more.');
        setTab(file);
        const base = `${window.location.origin}/alphatab/`;
        const a = new alphaTab.AlphaTabApi(host.current, {
          // Absolute addresses: alphaTab's background workers can't resolve site-relative ones.
          core: { scriptFile: `${base}alphaTab.min.js`, fontDirectory: `${base}font/` },
          player: { enablePlayer: true, enableCursor: true, soundFont: `${base}soundfont/sonivox.sf3`, scrollElement: scroller.current },
          display: { scale: window.innerWidth < 600 ? 0.8 : 1 },
        });
        api.current = a;
        a.error.on((e: any) => live && setError(`This file couldn’t be read as a tab. ${e?.message || ''}`.trim()));
        a.scoreLoaded.on((score: any) => {
          if (!live) return;
          const list: Part[] = score.tracks.map((t: any) => ({ index: t.index, name: t.name || `Part ${t.index + 1}` }));
          setParts(list);
          setPart(0);
        });
        a.renderFinished.on(() => live && setRendered(true));
        a.playerReady.on(() => live && setReady(true));
        a.playerStateChanged.on((e: any) => live && setPlaying(e.state === 1));
        a.load(new Uint8Array(file.bytes), [0]);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'The tab couldn’t be opened.');
      }
    })();
    return () => {
      live = false;
      try {
        api.current?.destroy();
      } catch {
        /* already torn down */
      }
      api.current = null;
    };
  }, [id]);

  const choosePart = (index: number) => {
    const a = api.current;
    if (!a?.score) return;
    setPart(index);
    a.renderTracks([a.score.tracks[index]]);
  };
  const toggle = () => {
    // The tab's own sound and Spotify at once would be a mess: pause Spotify first.
    if (!playing && player.get().playback?.is_playing) commands.toggle();
    api.current?.playPause();
  };
  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (api.current) api.current.playbackSpeed = s;
  };
  const toggleLoop = () => {
    setLoop(!loop);
    if (api.current) api.current.isLooping = !loop;
  };
  const toggleClick = () => {
    setClick(!click);
    if (api.current) api.current.metronomeVolume = click ? 0 : 1;
  };

  return (
    <div className="tabplayer">
      <header className="tab-head">
        <button className="icon-btn" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <span className="row-text">
          <span className="row-title">{tab?.title || 'Tab'}</span>
          <span className="row-sub">{tab ? [tab.artist, tab.name].filter(Boolean).join(' · ') : ''}</span>
        </span>
      </header>

      {parts.length > 1 && (
        <div className="segments tab-parts" role="tablist" aria-label="Part">
          {parts.map((p) => (
            <button key={p.index} role="tab" aria-selected={part === p.index} className={part === p.index ? 'on' : ''} onClick={() => choosePart(p.index)}>{p.name}</button>
          ))}
        </div>
      )}

      <div className="tab-scroll" ref={scroller}>
        {error && <p className="status">{error}</p>}
        {!error && !rendered && <div className="status"><span className="spinner" /></div>}
        <div className="tab-paper" ref={host} />
      </div>

      <div className="tab-controls">
        <button className="play-btn tab-play" onClick={toggle} disabled={!ready || !!error} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </button>
        <div className="segments tab-speed" role="radiogroup" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? 'on' : ''} onClick={() => changeSpeed(s)}>{s * 100}%</button>
          ))}
        </div>
        <button className={`icon-btn ${loop ? 'on' : ''}`} onClick={toggleLoop} aria-pressed={loop} aria-label="Loop"><RepeatIcon size={22} /></button>
        <button className={`pill tab-click ${click ? 'on' : ''}`} onClick={toggleClick} aria-pressed={click}>Click</button>
      </div>
      {!ready && !error && rendered && <p className="tab-hint">Loading instrument sounds…</p>}
    </div>
  );
}
